// Turn the raw ElevenLabs takes (research/audio/raw/sfx/<name>_<k>.mp3, gitignored) into the game's sample set:
// trim leading/trailing silence, mono 44.1 kHz, peak-normalise to -1 dBFS, rename to the game's sfx kind
// (snake_case -> camelCase), drop silent takes, and write public/audio/sfx/manifest.json for core/audio.ts.
// Usage: node tools/audio/build_sfx.mjs [--max 4] [--skip name_k,name_k]
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
const RAW = "research/audio/raw/sfx", OUT = "public/audio/sfx";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MAX = Number(arg("--max", 4)), SKIP = new Set((arg("--skip", "") || "").split(",").filter(Boolean));
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function maxVol(f) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", f, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = /max_volume: (-?[\d.]+) dB/.exec(r); return m ? Number(m[1]) : -99;
}
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".mp3") || f === "manifest.json") rmSync(join(OUT, f));
const groups = {};
for (const f of readdirSync(RAW).filter((f) => f.endsWith(".mp3")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
  const m = /^(.*)_(\d+)\.mp3$/.exec(f); if (!m || SKIP.has(`${m[1]}_${m[2]}`)) continue;
  (groups[m[1]] ??= []).push(f);
}
const manifest = {}, tmp = join(OUT, ".tmp.wav");
for (const [name, files] of Object.entries(groups)) {
  const kind = camel(name), out = [];
  for (const f of files) {
    if (out.length >= MAX) break;
    // trim: strip leading silence (3 ms fade-in so the cut doesn't click), then cut at the start of the final silence
    // (ElevenLabs pads takes to whole seconds and ends them with a few ms of encoder noise, so a reverse strip stalls)
    const src = join(RAW, f), D = dur(src);
    const sil = [...spawnSync("ffmpeg", ["-hide_banner", "-i", src, "-af", "silencedetect=noise=-50dB:d=0.05", "-f", "null", "-"], { encoding: "utf8" }).stderr.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)];
    const lastSil = sil.at(-1), end = lastSil && Number(lastSil[2]) > D - 0.05 ? Number(lastSil[1]) + 0.04 : D;
    spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "44100", "-af",
      `atrim=0:${end.toFixed(3)},silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004,afade=t=in:d=0.003,areverse,afade=t=in:d=0.02,areverse`, tmp]);
    const mv = maxVol(tmp);
    if (mv < -30) { console.log(`skip ${f}: near-silent (${mv} dB)`); continue; }
    const file = `${kind}_${out.length + 1}.mp3`;
    spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", tmp, "-af", `volume=${(-1 - mv).toFixed(2)}dB`, "-c:a", "libmp3lame", "-b:a", "112k", join(OUT, file)]);
    out.push(file);
  }
  if (out.length) manifest[kind] = out;
}
rmSync(tmp, { force: true });
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.entries(manifest).map(([k, v]) => `${k}:${v.length}`).join(" "));
