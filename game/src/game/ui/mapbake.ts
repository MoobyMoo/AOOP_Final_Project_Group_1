// The M map image, made the way Duckov makes theirs (POLISH_FINDINGS 5: MiniMapShooter, an orthographic overhead
// capture of the real scene per subscene, 2048² outdoors and 1024² for small underground floors), then restyled into
// an authored map in our art style instead of a photo:
//   1. capture: the real raid scene from straight above with an orthographic camera, lit flat (a white hemisphere,
//      sun and fill at zero, fog pushed out, no rim, no cut-outs) so every surface shows its own paint. Water swaps to a flat
//      tint that marks itself in the alpha channel; the colour and the depth buffer are kept.
//   2. map pass (GPU, one draw): a Kuwahara filter flattens texture noise into painted areas; a hillshade and a short
//      cast shadow from the height buffer give relief; ink lines where the height jumps (roof edges, walls, cliffs,
//      canopies) and along the shoreline; a simplified palette (value bands, held saturation, warm paper shadows).
//   3. vector overlays on a 2D canvas: roof outlines from the building footprints, cliff ticks.
//   4. the cut-out (mapshape.ts, map v4): the image is clipped to the level's own shape (land and a sliver of sea, or
//      the grotto's chambers) with an ink edge and a drop shadow, the closed north fading into a torn edge; the grid
//      and the coast's water-lining are drawn there, on the piece only.
// Drawn once at load (main.ts buildMapShots): nothing here runs per frame.
import * as THREE from "three";
import { G } from "../core/state";
import { CUT } from "../render/cutout";
import { U, inkU } from "../render/shading";
import { edgeDist } from "../world/grid";
import { houseFootprints } from "../world/buildings";
import { LAND } from "../world/map/grove";
import { exits } from "../world/props";
import { cutout, type Closed, type MapShape } from "./mapshape";

export type MapFrame = { minX: number; maxX: number; minZ: number; maxZ: number };
export type MapImage = MapFrame & { id: "surface" | "under"; w: number; h: number; canvas: HTMLCanvasElement; url: string; ppu: number; shape: MapShape };

const POST_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 uTexel; uniform float uPpu; uniform float uNear; uniform float uFar; uniform float uTop; uniform float uUnder;
float height(vec2 uv) { float d = texture2D(tDepth, uv).x; return uTop - (uNear + d * (uFar - uNear)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 rgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Kuwahara, 4 quadrants of radius R: the flattest quadrant's mean wins, so texture noise becomes flat paint and edges stay sharp
vec3 kuwahara(vec2 uv) {
  const int R = 3; vec3 m[4]; vec3 s[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
  for (int j = -R; j <= R; j++) for (int i = -R; i <= R; i++) {
    vec3 c = texture2D(tColor, uv + vec2(float(i), float(j)) * uTexel).rgb; vec3 c2 = c * c;
    if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; } if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
    if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; } if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
  }
  float n = float((R + 1) * (R + 1)); float best = 1e9; vec3 outc = vec3(0.0);
  for (int k = 0; k < 4; k++) { vec3 mu = m[k] / n; vec3 v = abs(s[k] / n - mu * mu); float sv = v.r + v.g + v.b; if (sv < best) { best = sv; outc = mu; } }
  return outc;
}
void main() {
  float h = height(vUv);
  float water = 1.0 - texture2D(tColor, vUv).a;
  vec3 c = toSrgb(kuwahara(vUv));
  // relief: a hillshade from the height field (light from the north-west, the cartographer's convention), clamped so
  // walls and canopies do not flip to black, and a short cast shadow to the south-east under anything that stands up
  float e = 2.0;
  float hx = height(vUv + vec2(uTexel.x * e, 0.0)) - height(vUv - vec2(uTexel.x * e, 0.0));
  float hz = height(vUv + vec2(0.0, uTexel.y * e)) - height(vUv - vec2(0.0, uTexel.y * e));
  vec2 g = clamp(vec2(hx, -hz) * uPpu / (2.0 * e), -2.5, 2.5); // image v runs to -z (north up): flip z
  vec3 n = normalize(vec3(-g.x, -g.y, 1.0));
  vec3 L = normalize(vec3(-0.6, 0.6, 0.75));
  float hill = clamp(dot(n, L) / L.z, 0.55, 1.3);
  float shadow = 0.0;
  for (int k = 1; k <= 5; k++) { vec2 o = vec2(-1.0, 1.0) * float(k) * 0.35 * uPpu * uTexel; float hk = height(vUv + o); shadow = max(shadow, smoothstep(0.8, 1.6, hk - h - float(k) * 0.2)); }
  // ink where the height jumps (roof edges, walls, canopies, cliffs) and where land meets water
  float jump = 0.0, wEdge = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)) * uTexel * 1.25;
    jump = max(jump, abs(height(vUv + o) - h));
    wEdge = max(wEdge, abs((1.0 - texture2D(tColor, vUv + o).a) - water));
  }
  float ink = smoothstep(0.75, 1.4, jump) * (1.0 - water);
  // the simplified palette: value in soft bands, saturation held a little under the game's
  vec3 hsv = rgb2hsv(c);
  float band = (floor(hsv.z * 7.0) + 0.5) / 7.0;
  hsv.z = mix(hsv.z, band, 0.45);
  hsv.y = clamp(hsv.y * 0.92, 0.0, 0.85);
  c = hsv2rgb(hsv);
  c *= mix(1.0, hill, 0.55);
  c = mix(c, c * vec3(0.6, 0.6, 0.68), shadow * 0.4 * (1.0 - water));
  // water: a flat body that darkens with depth below the surface, ruled by the overlay pass later
  if (water > 0.5) { float deep = smoothstep(0.1, 2.2, -0.32 - h); c = mix(vec3(0.46, 0.68, 0.66), vec3(0.2, 0.43, 0.52), deep); }
  vec3 inkC = mix(c * 0.32, vec3(0.13, 0.09, 0.07), 0.5);
  c = mix(c, inkC, max(ink, smoothstep(0.2, 0.9, wEdge) * 0.85));
  // paper: a faint fibre so flat areas do not read as screen fills
  c *= 0.975 + 0.05 * hash(floor(vUv / uTexel / 2.0));
  if (uUnder > 0.5) c *= 0.92;
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

/** render one frame of the scene from straight above and run the map pass; returns the image as a canvas */
function capture(scene: THREE.Scene, f: MapFrame, w: number, h: number, under: boolean): HTMLCanvasElement {
  const r = G.stage.renderer;
  const cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2, top = 70;
  const cam = new THREE.OrthographicCamera(-(f.maxX - f.minX) / 2, (f.maxX - f.minX) / 2, (f.maxZ - f.minZ) / 2, -(f.maxZ - f.minZ) / 2, 1, 110);
  cam.up.set(0, 0, -1); cam.position.set(cx, top, cz); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType), samples: 0 });
  rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter;
  // Flat light: every light at zero but the hemisphere, which turns white above and below. Lights, fog and shadow maps
  // keep their configuration (only intensities, colours and the fog range change), so the capture compiles the same
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
  const fl = (flat ?? amb)! as THREE.Light; fl.color.set("#ffffff"); (fl as THREE.HemisphereLight).groundColor?.set("#ffffff"); fl.intensity = Math.PI * (under ? 0.92 : 1.0);
  const fog = scene.fog as THREE.Fog | null, fogR = fog?.isFog ? [fog.near, fog.far] : null; if (fog?.isFog) { fog.near = 1e5; fog.far = 1e6; }
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [], wm = waterMat();
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.name === "water" && m.isMesh) { swapped.push([m, m.material]); m.material = wm; }
    // gameplay rings, fx sprites and points are not part of a map
    if (((o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || o.name === "embers") && o.visible) { hidden.push(o); o.visible = false; }
  });
  for (const e of exits) for (const o of [e.ring, e.fill]) if (o.visible) { hidden.push(o); o.visible = false; }
  scene.background = new THREE.Color(under ? "#17130f" : "#2d6a78");
  U.uRimColor.value.set(0, 0, 0); CUT.uCutOn.value = 0; inkU.uRes.value.set(w, h); r.autoClear = true;
  const prevTarget = r.getRenderTarget(), prevClear = r.getClearAlpha(), cc = new THREE.Color(); r.getClearColor(cc);
  r.setClearColor(under ? "#17130f" : "#2d6a78", 1);
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
      uNear: { value: cam.near }, uFar: { value: cam.far }, uTop: { value: top }, uUnder: { value: under ? 1 : 0 } } });
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

/** the vector layer the capture cannot give: roof outlines and cliff ticks (the grotto: its rock darkened) */
function overlay(c: HTMLCanvasElement, f: MapFrame, under: boolean) {
  const x = c.getContext("2d")!, ppu = c.width / (f.maxX - f.minX);
  const X = (v: number) => (v - f.minX) * ppu, Z = (v: number) => (v - f.minZ) * ppu;
  if (!under) {
    // roofs: a second, crisp ink outline and a ridge line along the long axis (a hand-drawn map's roof)
    x.lineJoin = "round"; x.lineCap = "round";
    for (const h of houseFootprints()) {
      if (h.x < f.minX || h.x > f.maxX || h.z < f.minZ || h.z > f.maxZ) continue;
      x.strokeStyle = "rgba(32,22,16,0.9)"; x.lineWidth = Math.max(2, ppu * 0.28);
      x.strokeRect(X(h.x - h.hx), Z(h.z - h.hz), h.hx * 2 * ppu, h.hz * 2 * ppu);
      x.strokeStyle = "rgba(32,22,16,0.45)"; x.lineWidth = Math.max(1, ppu * 0.14); x.beginPath();
      if (h.hx >= h.hz) { x.moveTo(X(h.x - h.hx + h.hz), Z(h.z)); x.lineTo(X(h.x + h.hx - h.hz), Z(h.z)); } else { x.moveTo(X(h.x), Z(h.z - h.hz + h.hx)); x.lineTo(X(h.x), Z(h.z + h.hz - h.hx)); }
      x.stroke();
    }
    // cliffs: short hachure ticks on the land side of every cliff stretch of the outline
    x.strokeStyle = "rgba(40,28,20,0.55)"; x.lineWidth = Math.max(1.2, ppu * 0.12);
    for (let i = 0; i < LAND.length; i++) {
      const a = LAND[i], b = LAND[(i + 1) % LAND.length]; if (a[2] !== "cliff") continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
      for (let t = 0; t < len; t += 1.6) {
        const px = a[0] + (b[0] - a[0]) * (t / len), pz = a[1] + (b[1] - a[1]) * (t / len), s = edgeDist(px + nx * 2, pz + nz * 2) > 0 ? 1 : -1;
        x.beginPath(); x.moveTo(X(px), Z(pz)); x.lineTo(X(px + nx * s * (1.4 + (t % 3.2 < 1.6 ? 0.8 : 0))), Z(pz + nz * s * (1.4 + (t % 3.2 < 1.6 ? 0.8 : 0)))); x.stroke();
      }
    }
  } else {
    // underground: rock is dark; only the carved chambers and corridors are lit (Duckov's underground floors)
    const m = document.createElement("canvas"), step = 0.5, mw = Math.ceil((f.maxX - f.minX) / step), mh = Math.ceil((f.maxZ - f.minZ) / step);
    m.width = mw; m.height = mh; const mx = m.getContext("2d")!, img = mx.createImageData(mw, mh);
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
      const d = edgeDist(f.minX + (i + 0.5) * step, f.minZ + (j + 0.5) * step), k = (j * mw + i) * 4;
      const a = d > 0.2 ? 0 : Math.min(1, (0.2 - d) / 2.0); // the rock rim the cut-out keeps reads as wall shading
      img.data[k] = 18; img.data[k + 1] = 15; img.data[k + 2] = 13; img.data[k + 3] = Math.round(a * 255);
    }
    mx.putImageData(img, 0, 0); x.imageSmoothingEnabled = true; x.drawImage(m, 0, 0, c.width, c.height);
  }
}

/** bake one level's map image: capture + map pass + vector layer + cut-out. `extra` draws before the cut (the demo edge) */
export function bakeMap(scene: THREE.Scene, id: MapImage["id"], f: MapFrame, longSide: number, opts: { extra?: (x: CanvasRenderingContext2D, img: MapImage) => void; closed?: Closed } = {}): MapImage {
  const t0 = performance.now(), W = f.maxX - f.minX, H = f.maxZ - f.minZ;
  const w = Math.round(W >= H ? longSide : (longSide * W) / H), h = Math.round(W >= H ? (longSide * H) / W : longSide);
  const under = id === "under", c = capture(scene, f, w, h, under), t1 = performance.now();
  overlay(c, f, under); const t2 = performance.now();
  const img = { ...f, id, w, h, canvas: c, url: "", ppu: w / W } as MapImage;
  opts.extra?.(c.getContext("2d")!, img);
  img.shape = cutout(c, f, under, opts.closed); const t3 = performance.now();
  // encoded off the main thread; until it lands the map reads the canvas through a data URL on demand (never in play)
  c.toBlob((b) => { if (b) img.url = URL.createObjectURL(b); else img.url = c.toDataURL("image/png"); }, "image/webp", 0.93);
  console.info(`map bake ${id}: ${w}x${h} in ${Math.round(performance.now() - t0)} ms (capture ${Math.round(t1 - t0)}, overlay ${Math.round(t2 - t1)}, cut-out ${Math.round(t3 - t2)})`);
  return img;
}
