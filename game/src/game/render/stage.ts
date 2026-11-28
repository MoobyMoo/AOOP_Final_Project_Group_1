// Renderer, bright-style post, telephoto follow camera, shadow box that follows the focus.
// Settings come from the L1 look target (research/look FINDINGS; council R3): 55 deg pitch, -30 deg yaw, FOV 24,
// warm low sun, cool hemisphere fill, PCF soft shadows, bloom + SMAA only (bright style: no tone-map pass, no AO pass).
import * as THREE from "three";
import { graphics, type Graphics } from "./graphics";
/** highlight roll-off merged into the existing effect pass (no extra pass): G1 council found sunlit dirt clipping on
 *  13-40% of the frame (Duckov 0.1-0.2%). Khronos PBR Neutral keeps hue and midtones and only compresses the top end.
 *  ?tm=none restores the old look; ?tm=agx to compare. */
function toneMap() {
  const m = new URLSearchParams(location.search).get("tm") ?? "neutral";
  return m === "none" ? [] : [new ToneMappingEffect({ mode: m === "agx" ? ToneMappingMode.AGX : ToneMappingMode.NEUTRAL })];
}
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { U, inkU } from "./shading";

const QS = new URLSearchParams(location.search);
/** key and camera-side fill (?sun= and ?bounce= override). The fill came down from 1.6 so props keep a shaded side; the
 *  sun went 6.0 -> 6.3 to hold the ground where it was (lumastats: colony p50 145, camp clip 0.3%, same as before). */
export const SUN = 6.3, BOUNCE = 1.1;

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(24, 1, 1, 220);
  composer: EffectComposer;
  renderPass: RenderPass;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  bounce: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  focus = new THREE.Vector3();
  cam = { pitch: THREE.MathUtils.degToRad(Number(QS.get("pitch") ?? 55)), yaw: THREE.MathUtils.degToRad(Number(QS.get("yaw") ?? -30)), dist: Number(QS.get("dist") ?? 40) };
  post = QS.get("post") !== "0";
  /** camera kick (u, decays) and trauma shake (0..1) — feedback channels, separate from hit-stop */
  kick = new THREE.Vector3(); trauma = 0;
  private shake = new THREE.Vector3();
  constructor(canvas: HTMLCanvasElement, haze = "#d9cfa8") {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false, depth: true });
    r.setPixelRatio(Math.min(devicePixelRatio, Number(QS.get("dpr") ?? 1.5)));
    r.info.autoReset = false; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NoToneMapping; r.toneMappingExposure = Number(QS.get("exp") ?? 1.3);
    const s = this.scene;
    s.background = new THREE.Color(haze); s.fog = new THREE.Fog(haze, 52, 110);
    this.sun = new THREE.DirectionalLight("#" + (QS.get("suncol") ?? "ffe0b0"), Number(QS.get("sun") ?? SUN));
    const sh = this.sun.shadow; this.sun.castShadow = true; sh.mapSize.set(4096, 4096); sh.radius = 3; sh.bias = -0.0004; sh.normalBias = 0.03;
    Object.assign(sh.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 100 });
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Number(QS.get("sunel") ?? 50)), THREE.MathUtils.degToRad(Number(QS.get("sunaz") ?? 160)));
    this.hemi = new THREE.HemisphereLight("#a9c4ff", "#4a3e2e", Number(QS.get("fill") ?? 0.9));
    // warm bounce from the camera side: the sun sits behind the scene (long shadows toward the camera), so every
    // camera-facing wall was lit by the hemisphere alone (~0.3 sRGB; flagged by the structures and house kits).
    // No shadows; Duckov-style soft "plastic" fill rather than a second sun.
    // BOUNCE down from 1.6 (G1 council fix 2/3): at 1.6 it lit every face the sun misses, so props had no shaded side.
    this.bounce = new THREE.DirectionalLight("#ffd8b0", Number(QS.get("bounce") ?? BOUNCE));
    this.bounce.position.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 28), THREE.MathUtils.degToRad(Number(QS.get("sunaz") ?? 160) - 180));
    s.add(this.sun, this.sun.target, this.hemi, this.bounce);
    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType });
    this.renderPass = new RenderPass(s, this.camera); this.composer.addPass(this.renderPass);
    this.composer.addPass(new EffectPass(this.camera, new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.95, intensity: 0.4 }), ...toneMap(), new VignetteEffect({ offset: 0.42, darkness: 0.28 }), new SMAAEffect()));
    addEventListener("resize", () => this.resize()); this.applyGraphics(graphics, true);
  }
  private graphicsFixed = false;
  applyGraphics(config: Graphics, honorQuery = false) {
    const r = this.renderer;
    const queryDpr = honorQuery && QS.has("dpr") ? Number(QS.get("dpr")) : NaN;
    const ratio = Number.isFinite(queryDpr) && queryDpr > 0 ? queryDpr : Math.min(devicePixelRatio, 2) * config.scale;
    this.graphicsFixed = true; this.dprNow = this.dprMax = Math.max(0.5, Math.min(2.5, ratio));
    r.setPixelRatio(this.dprNow); r.shadowMap.enabled = config.shadows;
    const size = config.quality === "high" ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    r.shadowMap.needsUpdate = true;
    this.post = honorQuery && QS.has("post") ? QS.get("post") !== "0" : config.post;
    this.resize();
  }
  /** switch the rendered scene; the sun and fill move with it */
  setScene(s: THREE.Scene, fog = true) {
    s.add(this.sun, this.sun.target, this.hemi, this.bounce);
    if (!s.background) s.background = (this.scene.background as THREE.Color)?.clone() ?? new THREE.Color("#d9cfa8");
    if (fog && !s.fog && this.scene.fog) s.fog = (this.scene.fog as THREE.Fog).clone();
    this.scene = s; this.renderPass.mainScene = s;
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false); this.composer.setSize(innerWidth, innerHeight); inkU.uRes.value.set(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.fov = 0; this.setFov(this.fovLand, this.fovPortrait, this.fovScale);
  }
  /** base FOV (landscape / portrait) times a scale (the raid's ADS zoom); the projection is rebuilt only on a change */
  fovLand = 24; fovPortrait = 34; fovScale = 1;
  setFov(land = 24, portrait = 34, scale = 1) {
    this.fovLand = land; this.fovPortrait = portrait; this.fovScale = scale;
    const f = (this.camera.aspect < 1 ? portrait : land) * scale;
    if (Math.abs(f - this.camera.fov) > 1e-4) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
  }
  /** move the camera to look at `target` (smoothed by caller); applies kick + shake */
  place(target: THREE.Vector3, dt: number, t: number) {
    this.focus.copy(target);
    this.kick.multiplyScalar(Math.exp(-dt * 14));
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const k = this.trauma * this.trauma * 0.35;
    this.shake.set(Math.sin(t * 61) * k, 0, Math.cos(t * 53) * k);
    const off = new THREE.Vector3().setFromSphericalCoords(this.cam.dist, Math.PI / 2 - this.cam.pitch, this.cam.yaw);
    const f = this.focus.clone().add(this.kick).add(this.shake);
    this.camera.position.copy(f).add(off); this.camera.lookAt(f);
    // shadow box follows the focus, snapped to whole shadow texels so edges don't crawl
    const shadow = this.sun.shadow;
    const texelX = (shadow.camera.right - shadow.camera.left) / shadow.mapSize.x;
    const texelZ = (shadow.camera.top - shadow.camera.bottom) / shadow.mapSize.y;
    const sp = this.focus.clone();
    sp.x = Math.round(sp.x / texelX) * texelX;
    sp.z = Math.round(sp.z / texelZ) * texelZ;
    this.sun.position.copy(sp).addScaledVector(this.sunDir, 45); this.sun.target.position.copy(sp);
    U.uRimDir.value.set(-0.55, 0.65, 0.35).normalize();
  }
  /** adaptive pixel ratio (advisor 32): step down when frames run long, back up when there's headroom */
  private ft: number[] = []; private dprMax = Math.min(devicePixelRatio, Number(QS.get("dpr") ?? 2)); private dprNow = Math.min(devicePixelRatio, Number(QS.get("dpr") ?? 1.5)); private lastT = performance.now();
  adapt() {
    if (this.graphicsFixed) return;
    const now = performance.now(); this.ft.push(now - this.lastT); this.lastT = now;
    if (this.ft.length < 90 || QS.has("fixdpr")) return;
    const s = [...this.ft].sort((a, b) => a - b), med = s[45]; this.ft.length = 0;
    const steps = [1, 1.25, 1.5, 1.75, 2].filter((v) => v <= this.dprMax + 1e-3);
    const i = steps.findIndex((v) => Math.abs(v - this.dprNow) < 1e-3);
    if (med > 18 && i > 0) this.dprNow = steps[i - 1]; else if (med < 11 && i >= 0 && i < steps.length - 1) this.dprNow = steps[i + 1]; else return;
    this.renderer.setPixelRatio(this.dprNow); this.resize();
  }
  render(dt: number) { this.adapt(); this.renderer.info.reset(); if (this.post) this.composer.render(dt); else this.renderer.render(this.scene, this.camera); }
  /** world point under the mouse on the plane y = h */
  pick(ndcX: number, ndcY: number, h = 0.9) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const p = new THREE.Vector3(); rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), p); return p;
  }
}
