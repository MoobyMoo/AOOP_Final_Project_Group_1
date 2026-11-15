// Music/ambience from raw ElevenLabs renders (research/audio/raw/music/<name>.mp3, gitignored) to the game's files:
// loops get a seamless self-crossfade (the file starts X s in and its last X s crossfade into the original first X s,
// so the end runs straight into the start), everything is loudness-normalised (EBU R128; beds sit lower than themes)
// and encoded Ogg Vorbis. Writes public/audio/music/manifest.json { name: file } for core/music.ts.
// Usage: node tools/audio/build_music.mjs
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
const RAW = "research/audio/raw/music", OUT = "public/audio/music";
/** name -> [target LUFS, crossfade seconds (0 = one-shot, no loop)] */
const SPEC = {
  // home
  bunkerTheme: [-18, 4], bunkerBed: [-26, 3],
  // raid area themes (sparse, under play) and their ambience beds; raidTheme/raidBed are the old single pair, still read as a fallback
  beachTheme: [-20, 4], plantationTheme: [-20, 4], grottoTheme: [-21, 4], mangroveTheme: [-20, 4], raidTheme: [-19, 4],
  beachBed: [-23, 3], plantationBed: [-24, 3], grottoBed: [-24, 3], mangroveBed: [-24, 3], raidBed: [-22, 3],
  // fights: combat sits on top of an area theme; the boss loop replaces both
  combat: [-18, 2], bossTheme: [-16, 2],
  // one-shots
  stingExtract: [-15, 0], stingBonk: [-16, 0], stingRare: [-17, 0], stingBossIntro: [-15, 0], stingBossDown: [-15, 0],
};
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);
if (!existsSync(RAW) || !readdirSync(RAW).some((f) => /\.(mp3|wav)$/.test(f))) { console.error(`no raw renders in ${RAW}; leaving ${OUT} as it is`); process.exit(1); }
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".ogg") || f === "manifest.json") rmSync(join(OUT, f));
const manifest = {};
for (const f of readdirSync(RAW).filter((f) => /\.(mp3|wav)$/.test(f))) {
  const name = f.replace(/\.(mp3|wav)$/, ""), spec = SPEC[name];
  if (!spec) { console.log(`skip ${f}: not in SPEC`); continue; }
  const [lufs, X] = spec, src = join(RAW, f), D = dur(src), out = `${name}.ogg`;
  const norm = `loudnorm=I=${lufs}:TP=-1.5:LRA=11`;
  const graph = X > 0
    ? `[0]asplit=3[a][b][c];[a]atrim=${X}:${D - X},asetpts=PTS-STARTPTS[body];` +
      `[b]atrim=${D - X}:${D},asetpts=PTS-STARTPTS,afade=t=out:d=${X}:curve=qsin[tail];` +
      `[c]atrim=0:${X},asetpts=PTS-STARTPTS,afade=t=in:d=${X}:curve=qsin[head];` +
      `[tail][head]amix=inputs=2:normalize=0[seam];[body][seam]concat=n=2:v=0:a=1,${norm}[o]`
    : `[0]${norm}[o]`;
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-filter_complex", graph, "-map", "[o]", "-ar", "44100", "-c:a", "libvorbis", "-q:a", "4", join(OUT, out)], { encoding: "utf8" });
  if (r.status) { console.error(`${f}: ${r.stderr}`); continue; }
  manifest[name] = out; console.log(`${name}: ${D.toFixed(1)} s -> ${dur(join(OUT, out)).toFixed(1)} s${X ? " loop" : ""}`);
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
