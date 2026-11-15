// ?tune: the dev tuning panel over core/tune.ts. three's bundled lil-gui, one folder per group, restyled in UI v3's ink
// and brass. Every slider writes through setTune, so the change is live (the game reads the group objects every frame)
// and persists in localStorage. Export copies the overrides JSON to the clipboard and downloads it; Import takes pasted
// JSON; each folder has "reset group" and the top has "reset everything". Loaded only with ?tune (main.ts).
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import { tuneGroups, setTune, resetGroup, resetAll, exportTune, importTune, onTune, getTune } from "../core/tune";

const CSS = `.lil-gui.bv-tune,.lil-gui.bv-tune .lil-gui{--background-color:#26252a;--widget-color:#3b3940;--hover-color:#4a4650;--focus-color:#5a5560;--text-color:#f3ead6;
--title-background-color:#19181c;--title-text-color:#e2bf82;--number-color:#e2bf82;--string-color:#9fd18a;--font-family:"Barlow Condensed","Arial Narrow",system-ui,sans-serif;
--font-size:13px;--input-font-size:13px;--name-width:52%}
.lil-gui.bv-tune{--width:330px;z-index:40;cursor:default;border:1px solid #4a4650;border-top:3px solid #c29a5b;max-height:calc(100vh - 24px);overflow-y:auto}
.lil-gui.bv-tune .title{letter-spacing:.02em}.lil-gui.bv-tune .lil-gui .title{color:#f3ead6}
.lil-gui.bv-tune .has-duckov-band{display:grid;grid-template-columns:var(--name-width) minmax(0,1fr)}
.lil-gui.bv-tune .has-duckov-band>.name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.lil-gui.bv-tune .bv-tune-band{grid-column:1/-1;box-sizing:border-box;padding:1px 4px 4px;color:#c6b793;font:11px/1.25 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:normal}`;

const bandNumber = (value: number) => Number(value.toPrecision(4)).toString();

export function openTunePanel() {
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const gui = new GUI({ title: "Bananaville tuning (?tune)" });
  gui.domElement.classList.add("bv-tune");
  gui.domElement.addEventListener("keydown", (e) => e.stopPropagation()); // typing a number must not walk the hero
  gui.domElement.addEventListener("mousedown", (e) => e.stopPropagation());
  const top = {
    export() {
      const json = exportTune();
      navigator.clipboard?.writeText(json).catch(() => {});
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = "bananaville-tune.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    import() { const json = prompt("Paste tuning JSON (from Export)"); if (!json) return; try { const n = importTune(json); refresh(); alert(`Applied ${n} values`); } catch (e) { alert("That is not tuning JSON: " + e); } },
    resetAll() { if (confirm("Reset every tuned value to its default?")) { resetAll(); refresh(); } },
  };
  gui.add(top, "export").name("Export JSON (copy + download)");
  gui.add(top, "import").name("Import JSON");
  gui.add(top, "resetAll").name("Reset everything");
  for (const g of tuneGroups()) {
    const f = gui.addFolder(g.name + (g.persist ? "" : " (saved by the game)"));
    if (g.note) f.domElement.title = g.note;
    for (const [key, k] of g.keys) {
      // lil-gui needs the owning object and the last path part
      let o = g.obj as Record<string, unknown>; for (const p of k.path.slice(0, -1)) o = o[p] as Record<string, unknown>;
      const last = k.path[k.path.length - 1];
      const c = f.add(o as Record<string, number>, last, k.range.min, k.range.max, k.range.step ?? (k.range.max - k.range.min) / 100);
      c.name(k.range.label ? `${key} · ${k.range.label}` : key);
      c.onChange((v: number) => setTune(g.name, key, v));
      c.domElement.title = `${g.name}.${key} default ${k.def}`;
      c.domElement.dataset.tuneKey = `${g.name}.${key}`;
      if (k.band) {
        const band = k.band;
        const hint = document.createElement('small');
        hint.className = 'bv-tune-band';
        hint.textContent = `Duckov band · med ${bandNumber(band.median)} · p10–p90 ${bandNumber(band.p10)}–${bandNumber(band.p90)}`;
        hint.title = `${band.source}; n=${band.count}; ${band.unit}; observed ${bandNumber(band.observedMin)}–${bandNumber(band.observedMax)}. Slider adds a 10% margin; defaults stay unchanged.`;
        c.domElement.classList.add('has-duckov-band');
        c.domElement.appendChild(hint);
      }
    }
    f.add({ reset: () => { resetGroup(g.name); refresh(); } }, "reset").name(`Reset ${g.name}`);
    f.close();
  }
  const refresh = () => gui.controllersRecursive().forEach((c) => c.updateDisplay());
  onTune(() => refresh());
  setInterval(refresh, 1000); // the settings menu writes the audio buses directly
  (globalThis as unknown as { __tunePanel: object }).__tunePanel = { gui, refresh, getTune };
  return gui;
}
