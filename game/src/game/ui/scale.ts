// UI scale (UI v3): every HUD and panel measurement is written in 1920x1080 reference pixels, the frame Duckov's
// numbers were converted to (POLISH_FINDINGS 9, a 2560x1440 canvas at MatchWidthOrHeight = 0.75 at 1080p).
// Like Duckov's CanvasScalerController: match height on wide screens, width on narrow ones. Two floors on top:
// small screens keep text readable (s >= 0.75, so 1280x720 shows a 1707x960 reference frame) as long as the
// loot screen's three columns still fit (reference width >= 1680).
// Scaled layers (.ui-ref) are sized to innerWidth / s by innerHeight / s and transformed by s, so CSS inside them
// anchors to edges and the centre in reference pixels. World-anchored elements convert screen px with toRef().
let s = 1;
export const uiScale = () => s;
export function computeScale(w = innerWidth, h = innerHeight) {
  const base = w / h >= 16 / 9 ? h / 1080 : w / 1920;
  return Math.min(Math.max(base, 0.75), w / 1680, 3);
}
function apply() {
  s = computeScale();
  const r = document.documentElement.style;
  r.setProperty("--s", s.toFixed(4));
  r.setProperty("--rw", (innerWidth / s).toFixed(1) + "px");
  r.setProperty("--rh", (innerHeight / s).toFixed(1) + "px");
  document.documentElement.classList.toggle("ui-short", innerHeight / s < 1040);
}
apply();
addEventListener("resize", apply);
/** screen px -> reference px inside a .ui-ref layer */
export const toRef = (v: number) => v / s;
