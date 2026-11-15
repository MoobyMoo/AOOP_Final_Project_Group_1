// The M map image, made the way Duckov makes theirs (POLISH_FINDINGS 5: MiniMapShooter, an orthographic overhead
// capture of the real scene per subscene, 2048² outdoors and 1024² for small underground floors). Map v5 follows the
// Duckov frames (research/duckov-footage/frames/m-map): the map IS the game world rendered top-down, round canopies,
// real roofs, dirt roads and fences, softly lit, with no ink, no hillshade stylisation and no paper:
//   1. capture: the raid scene from straight above, orthographic, under a soft sky light (the hemisphere: white above,
//      a warm grey below, so tops read bright and sides fall off; the sun, fill and rim at zero, fog pushed out, no
//      cut-outs). Grass tufts and the ink hulls are hidden (from above they are speckle and outline). Water swaps to
//      a flat tint that marks itself in the alpha channel; colour and depth are kept.
//   2. map pass (GPU, one draw): soft lighting from the depth buffer (a little ambient occlusion where things stand
//      up, a short soft shadow to the south-east), then a gentle grade toward Duckov's muted olive and ochre.
//   3. the cut-out (mapshape.ts): the island and a sliver of sea feather into the navy void (#051B2E); the closed north
//      darkens, loses its colour and fades into the same void.
// The underground is not captured: it is a slate-cyan floor plan (mapshape.ts blueprint), Duckov's underground style.
// Drawn once at load (main.ts buildMapShots): nothing here runs per frame.
import * as THREE from "three";
import { G } from "../core/state";
import { CUT } from "../render/cutout";
import { U, inkU } from "../render/shading";
import { exits } from "../world/props";
import { cutout, blueprint, type Closed, type MapShape } from "./mapshape";

export type MapFrame = { minX: number; maxX: number; minZ: number; maxZ: number };
export type MapImage = MapFrame & { id: "surface" | "under"; w: number; h: number; canvas: HTMLCanvasElement; url: string; ppu: number; shape: MapShape };

const POST_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 uTexel; uniform float uPpu; uniform float uNear; uniform float uFar; uniform float uTop;
float height(vec2 uv) { float d = texture2D(tDepth, uv).x; return uTop - (uNear + d * (uFar - uNear)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 rgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
void main() {
  float h = height(vUv);
  vec4 src = texture2D(tColor, vUv);
  float water = 1.0 - src.a;
  vec3 c = toSrgb(src.rgb);
  // soft lighting from the depth: ambient occlusion where neighbours stand above this point (the foot of a tree, a
  // wall, a roof edge), and a soft shadow cast to the south-east by anything taller to the north-west
  float occ = 0.0;
  for (int k = 0; k < 12; k++) { float a = float(k) * 0.5236; vec2 o = vec2(cos(a), sin(a)) * uPpu * uTexel * (k < 6 ? 0.7 : 1.5); occ += clamp(height(vUv + o) - h, 0.0, 2.0); }
  occ = clamp(occ / 12.0, 0.0, 1.0);
  float shadow = 0.0;
  for (int k = 1; k <= 6; k++) { vec2 o = vec2(-1.0, 1.0) * float(k) * 0.35 * uPpu * uTexel; shadow = max(shadow, smoothstep(0.3, 2.0, height(vUv + o) - h - float(k) * 0.25)); }
  c *= 1.0 - 0.32 * occ;
  c = mix(c, c * vec3(0.62, 0.66, 0.74), shadow * 0.42 * (1.0 - water));
  // the grade: Duckov's muted ground (frames: grass #828C68 / #9AA077, paths #BFAB8C, canopies #484527): greens a
  // step toward olive, everything a little less saturated, the darks lifted a touch
  vec3 hsv = rgb2hsv(c);
  float green = smoothstep(0.16, 0.22, hsv.x) * (1.0 - smoothstep(0.44, 0.52, hsv.x));
  hsv.x = mix(hsv.x, mix(hsv.x, 0.19, 0.35), green);
  hsv.y *= mix(0.8, 0.72, green);
  hsv.z = 0.05 + hsv.z * 0.97;
  c = hsv2rgb(hsv);
  // water: flat and dark blue, deeper further out (the frames' rivers and sea)
  if (water > 0.5) { float deep = smoothstep(0.1, 2.2, -0.32 - h); c = mix(vec3(0.27, 0.42, 0.46), vec3(0.11, 0.22, 0.31), deep); }
  gl_FragColor = vec4(c, 1.0);
}`;

/** swap every water plane to a flat tint that writes alpha 0 (the water mask) and no depth (the bed stays in depth) */
function waterMat() {
  return new THREE.ShaderMaterial({
    vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "void main() { gl_FragColor = vec4(0.25, 0.55, 0.62, 0.0); }",
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor,
  });
}
/** render the scene from straight above and run the map pass; returns the image as a canvas */
function capture(scene: THREE.Scene, f: MapFrame, w: number, h: number): HTMLCanvasElement {
  const r = G.stage.renderer;
  const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2, top = 70;
  const cam = new THREE.OrthographicCamera(-(f.maxX - f.minX) / 2, (f.maxX - f.minX) / 2, (f.maxZ - f.minZ) / 2, -(f.maxZ - f.minZ) / 2, 1, 110);
  cam.up.set(0, 0, -1); cam.position.set(cx, top, cz); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType), samples: 0 });
  rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter;
  // Soft light: every light at zero but the hemisphere (white sky, warm grey ground). Lights, fog and shadow maps keep
  // their configuration (only intensities, colours and the fog range change), so the capture compiles the same
  // shader variants the game draws with: the bake warms the game's programs instead of compiling a second set.
  const saved = { bg: scene.background, rim: U.uRimColor.value.clone(), cut: CUT.uCutOn.value, res: inkU.uRes.value.clone(), autoClear: r.autoClear };
  const lights: { l: THREE.Light; i: number; c: THREE.Color; g?: THREE.Color }[] = [];
  let flat: THREE.HemisphereLight | null = null;
  scene.traverse((o) => {
    const l = o as THREE.Light; if (!l.isLight) return;
    const hemi = (l as THREE.HemisphereLight).isHemisphereLight ? (l as THREE.HemisphereLight) : null;
    lights.push({ l, i: l.intensity, c: l.color.clone(), g: hemi?.groundColor.clone() });
    if (hemi && !flat && hemi.visible) flat = hemi; else l.intensity = 0;
  });
  const amb = flat ? null : new THREE.AmbientLight("#ffffff", 0); if (amb) scene.add(amb); // a scene without a hemisphere (never the raid)
  const fl = (flat ?? amb)! as THREE.Light; fl.color.set("#ffffff"); (fl as THREE.HemisphereLight).groundColor?.set("#8f877c"); fl.intensity = Math.PI * 1.08;
  const fog = scene.fog as THREE.Fog | null, fogR = fog?.isFog ? [fog.near, fog.far] : null; if (fog?.isFog) { fog.near = 1e5; fog.far = 1e6; }
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [], wm = waterMat();
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.name === "water" && m.isMesh) { swapped.push([m, m.material]); m.material = wm; return; }
    // gameplay rings, fx sprites and points are not part of a map; nor are grass tufts and the ink hulls
    if (((o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || o.name === "embers" || o.name === "grass" || o.name === "ink") && o.visible) { hidden.push(o); o.visible = false; }
  });
  for (const e of exits) for (const o of [e.ring, e.fill]) if (o.visible) { hidden.push(o); o.visible = false; }
  scene.background = new THREE.Color("#2d6a78");
  U.uRimColor.value.set(0, 0, 0); CUT.uCutOn.value = 0; inkU.uRes.value.set(w, h); r.autoClear = true;
  const prevTarget = r.getRenderTarget(), prevClear = r.getClearAlpha(), cc = new THREE.Color(); r.getClearColor(cc);
  r.setClearColor("#2d6a78", 1);
  r.setRenderTarget(rt); r.clear(); r.render(scene, cam);
  // restore the scene before anything else can render it
  amb?.removeFromParent(); for (const q of lights) { q.l.intensity = q.i; q.l.color.copy(q.c); if (q.g) (q.l as THREE.HemisphereLight).groundColor.copy(q.g); }
  for (const [m, mat] of swapped) m.material = mat; for (const o of hidden) o.visible = true; wm.dispose();
  if (fog && fogR) { fog.near = fogR[0]; fog.far = fogR[1]; }
  scene.background = saved.bg; U.uRimColor.value.copy(saved.rim); CUT.uCutOn.value = saved.cut; inkU.uRes.value.copy(saved.res);
  // the map pass into an 8-bit target, read back once
  const out = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
  const post = new THREE.ShaderMaterial({ vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) }, uPpu: { value: w / (f.maxX - f.minX) },
      uNear: { value: cam.near }, uFar: { value: cam.far }, uTop: { value: top } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post), ps = new THREE.Scene(); quad.frustumCulled = false; ps.add(quad);
  r.setRenderTarget(out); r.render(ps, cam);
  const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(out, 0, 0, w, h, px);
  r.setRenderTarget(prevTarget); r.setClearColor(cc, prevClear); r.autoClear = saved.autoClear;
  rt.depthTexture?.dispose(); rt.dispose(); out.dispose(); post.dispose(); quad.geometry.dispose();
  // GL rows run bottom-up; the camera's up is -z, so the first canvas row is the frame's north edge
  // a CPU-backed canvas: the cut-out reads the pixels back once, which a GPU canvas would make a readback stall
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true })!, img = x.createImageData(w, h);
  for (let row = 0; row < h; row++) img.data.set(px.subarray((h - 1 - row) * w * 4, (h - row) * w * 4), row * w * 4);
  x.putImageData(img, 0, 0);
  return c;
}

/** bake one level's map image. Surface: capture + map pass + vector layer + cut-out (`extra` draws before the cut: the
 *  demo edge). Underground: the blueprint floor plan, `inDemo` deciding which rooms are lit */
export function bakeMap(scene: THREE.Scene, id: MapImage["id"], f: MapFrame, longSide: number, opts: { extra?: (x: CanvasRenderingContext2D, img: MapImage) => void; closed?: Closed; lit?: (x: number, z: number) => boolean } = {}): MapImage {
  const t0 = performance.now(), W = f.maxX - f.minX, H = f.maxZ - f.minZ;
  const w = Math.round(W >= H ? longSide : (longSide * W) / H), h = Math.round(W >= H ? (longSide * H) / W : longSide);
  const img = { ...f, id, w, h, canvas: null as unknown as HTMLCanvasElement, url: "", ppu: w / W } as MapImage;
  let t1 = t0, t2 = t0;
  if (id === "under") { const b = blueprint(f, w, h, opts.lit ?? (() => true)); img.canvas = b.canvas; img.shape = b.shape; t1 = t2 = performance.now(); }
  else {
    const c = capture(scene, f, w, h); t1 = t2 = performance.now(); img.canvas = c;
    opts.extra?.(c.getContext("2d")!, img);
    img.shape = cutout(c, f, opts.closed);
  }
  const c = img.canvas, t3 = performance.now();
  // encoded off the main thread; until it lands the map reads the canvas through a data URL on demand (never in play)
  c.toBlob((b) => { if (b) img.url = URL.createObjectURL(b); else img.url = c.toDataURL("image/png"); }, "image/webp", 0.93);
  console.info(`map bake ${id}: ${w}x${h} in ${Math.round(performance.now() - t0)} ms (capture ${Math.round(t1 - t0)}, cut-out ${Math.round(t3 - t2)})`);
  return img;
}
