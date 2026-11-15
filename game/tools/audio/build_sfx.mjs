// Turn the raw ElevenLabs takes (research/audio/raw/sfx/<name>_<k>.mp3, gitignored) into the game's sample set:
// trim leading/trailing silence, mono 44.1 kHz, peak-normalise to -1 dBFS, rename to the game's sfx kind
// (snake_case -> camelCase), drop silent, clipped or overlong takes, and write public/audio/sfx/manifest.json for
// core/audio.ts. Footstep takes (step_<surface>_<k>.mp3) hold a walk of several steps; each step is cut out on its own.
// Every take is measured (length, peak, mean) and printed so the pick is made on numbers, not by ear alone.
// Usage: node tools/audio/build_sfx.mjs [--max 4] [--steps 8] [--skip name_k,name_k]
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
const RAW = "research/audio/raw/sfx", OUT = "public/audio/sfx";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MAX = Number(arg("--max", 4)), STEPS = Number(arg("--steps", 8)), SKIP = new Set((arg("--skip", "") || "").split(",").filter(Boolean));
/** longest a processed take may be before it is dropped as overlong (seconds); stings and roars may ring */
/** quietest peak (dBFS) a take may have before it is dropped as too weak to normalise; a distant echo tail is quiet by nature */
const WEAK = { shotTail: -32 };
const LONG = { stepSand: 0.6, stepMud: 0.6, stepGrass: 0.6, stepDirt: 0.6, stepPlank: 0.6, stepStone: 0.6, stepCave: 0.7, roar: 2.6, extract: 2.6, rare: 2, heal: 1.6, door: 1.6, shotTail: 1.6, slam: 1.6, ko: 1.4 };
const ff = (args) => spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8" });
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
/** peak, RMS and flat factor (> 0: runs of samples stuck at the peak, i.e. clipping). astats works in float; volumedetect
 *  would force 16-bit first and clip the inter-sample overs that decoded mp3s carry, so it under-reads hot takes */
function levels(f) {
  const r = ff(["-i", f, "-af", "aformat=sample_fmts=flt,astats=measure_overall=Peak_level+RMS_level+Flat_factor:measure_perchannel=none", "-f", "null", "-"]).stderr;
  const num = (re, d = -99) => { const m = re.exec(r); return m && Number.isFinite(Number(m[1])) ? +Number(m[1]).toFixed(1) : d; };
  return { max: num(/Peak level dB: (-?[\d.]+|-inf)/), mean: num(/RMS level dB: (-?[\d.]+|-inf)/), flat: num(/Flat factor: ([\d.]+)/, 0) };
}
/** [start, end] of each sound in a file, split on gaps of quiet */
function sounds(f, noise = -42, gap = 0.08) {
  const D = dur(f), r = ff(["-i", f, "-af", `silencedetect=noise=${noise}dB:d=${gap}`, "-f", "null", "-"]).stderr;
  const starts = [...r.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1])), ends = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const out = []; let t = starts[0] === 0 || (starts.length && starts[0] < 0.01) ? null : 0;
  for (let i = 0; i < starts.length; i++) { if (t !== null && starts[i] > t) out.push([t, starts[i]]); t = ends[i] ?? null; }
  if (t !== null && D - t > 0.03) out.push([t, D]);
  return out;
}
if (!existsSync(RAW) || !readdirSync(RAW).some((f) => f.endsWith(".mp3"))) { console.error(`no raw takes in ${RAW}; leaving ${OUT} as it is`); process.exit(1); }
/** steps in a take: { a, b } seconds, `sharp` = dB rise into the onset, `lvl` = its peak frame relative to the take's */
function onsets(f) {
  const buf = spawnSync("ffmpeg", ["-v", "error", "-i", f, "-f", "f32le", "-ac", "1", "-ar", "44100", "-"], { maxBuffer: 1 << 27 }).stdout;
  const x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4), F = 441, db = []; // 10 ms frames
  for (let i = 0; i + F <= x.length; i += F) { let e = 0; for (let j = 0; j < F; j++) e += x[i + j] ** 2; db.push(10 * Math.log10(e / F + 1e-12)); }
  const pk = Math.max(...db), r = db.map((d) => d - pk), out = [];
  for (let i = 3; i < r.length; i++) {
    const before = Math.min(...r.slice(Math.max(0, i - 8), i));
    if (r[i] > -22 && r[i] - before > 10 && (!out.length || i - out.at(-1).i > 22)) {
      let top = i; while (top + 1 < r.length && r[top + 1] >= r[top] && top < i + 6) top++;
      let j = top + 4; while (j < r.length && j < i + 45 && r[j] > r[top] - 24) j++;
      out.push({ i, a: Math.max(0, i - 1) / 100, b: j / 100, sharp: r[i] - before, lvl: r[top] });
    }
  }
  for (let k = 0; k + 1 < out.length; k++) out[k].b = Math.min(out[k].b, out[k + 1].a - 0.01);
  return out;
}
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".mp3") || f === "manifest.json") rmSync(join(OUT, f));
const groups = {};
for (const f of readdirSync(RAW).filter((f) => f.endsWith(".mp3")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
  const m = /^(.*)_(\d+)\.mp3$/.exec(f); if (!m || SKIP.has(`${m[1]}_${m[2]}`)) continue;
  (groups[m[1]] ??= []).push(f);
}
const manifest = {}, tmp = join(OUT, ".tmp.wav"), report = [];
/** cut [a, b] of src (b = null: to the start of the final silence), trim, normalise and keep it as the kind's next take */
function take(kind, src, a, b, out, label) {
  if (b === null) {
    // ElevenLabs pads takes to whole seconds and ends them with a few ms of encoder noise, so a reverse strip stalls:
    // cut at the start of the final silencedetect gap instead
    const D = dur(src), sil = [...ff(["-i", src, "-af", "silencedetect=noise=-50dB:d=0.05", "-f", "null", "-"]).stderr.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)];
    const lastSil = sil.at(-1); b = lastSil && Number(lastSil[2]) > D - 0.05 ? Number(lastSil[1]) + 0.04 : D;
  }
  ff(["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "44100", "-af",
    `atrim=${Math.max(0, a - 0.01).toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004,afade=t=in:d=0.003,areverse,afade=t=in:d=0.02,areverse`, "-c:a", "pcm_f32le", tmp]); // float: decoded mp3 peaks run past 0 dBFS, 16-bit would clip them
  const lv = levels(tmp), len = dur(tmp) || 0, cap = LONG[kind] ?? 1.2, clip = levels(src).flat;
  // drop: silent or too quiet to normalise without lifting the noise floor, clipped, empty, or far past the kind's length
  // (a take that rambles on is the wrong sound); trim: a little long, so cut it to the cap with a 60 ms fade
  const why = lv.max < -30 ? "near-silent" : lv.max < (WEAK[kind] ?? -18) ? "weak" : clip > 0.5 ? "clipped" : len < 0.03 ? "empty" : len > cap * 2.5 ? "overlong" : "";
  const trim = !why && len > cap;
  report.push(`${why ? "DROP" : "keep"} ${label.padEnd(24)} ${len.toFixed(2)} s  peak ${lv.max} dB  rms ${lv.mean} dB${why ? `  (${why})` : trim ? `  (trimmed to ${cap} s)` : ""}`);
  if (why) return;
  const file = `${kind}_${out.length + 1}.mp3`;
  const af = `${trim ? `atrim=0:${cap},afade=t=out:st=${cap - 0.06}:d=0.06,` : ""}volume=${(-1 - lv.max).toFixed(2)}dB`;
  ff(["-y", "-loglevel", "error", "-i", tmp, "-af", af, "-c:a", "libmp3lame", "-b:a", "112k", join(OUT, file)]);
  out.push(file);
}
for (const [name, files] of Object.entries(groups)) {
  const kind = camel(name), out = [], isStep = name.startsWith("step_");
  if (isStep) {
    // a walk of several steps per take: keep each step that is a clean single hit (60-450 ms), alternating takes for variety
    // a footstep take is a walk of several steps (or one step): normalise it, find each step by its onset on the energy
    // envelope, and keep the clean ones: a sharp rise (>= 22 dB in 80 ms, a heel strike rather than shuffling) that
    // lands within 14 dB of the walk's loudest step. Silence-splitting fails here: gritty walks never go quiet
    const walks = files.map((f, k) => {
      const w = join(OUT, `.walk${k}.wav`), pk = levels(join(RAW, f)).max;
      ff(["-y", "-loglevel", "error", "-i", join(RAW, f), "-ac", "1", "-ar", "44100", "-af", `volume=${(-1 - pk).toFixed(2)}dB`, "-c:a", "pcm_f32le", w]);
      return [f, w];
    });
    // a take under a second is one step already: use it whole (its onset is at 0, so there is no rise to measure)
    const cuts = walks.map(([f, w]) => (dur(w) < 1 ? [{ a: 0, b: null }] : onsets(w).filter((o) => o.sharp >= 22 && o.lvl >= -14)).map((o) => [f, w, o]));
    for (let i = 0; out.length < STEPS && cuts.some((c) => c.length); i++) {
      const c = cuts[i % cuts.length].shift(); if (c) take(kind, c[1], c[2].a, c[2].b === null ? null : c[2].b + 0.03, out, `${c[0]}@${c[2].a.toFixed(2)}`);
    }
    for (const [, w] of walks) rmSync(w, { force: true });
  } else for (const f of files) { if (out.length >= MAX) break; take(kind, join(RAW, f), 0, null, out, f); }
  if (out.length) manifest[kind] = out;
}
rmSync(tmp, { force: true });
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
console.log(report.join("\n"));
console.log(Object.entries(manifest).map(([k, v]) => `${k}:${v.length}`).join(" "));
