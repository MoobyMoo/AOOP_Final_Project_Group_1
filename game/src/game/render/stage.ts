// Renderer, bright-style post, telephoto follow camera, shadow box that follows the focus.
// Settings come from the L1 look target (research/look FINDINGS; council R3): 55 deg pitch, -30 deg yaw, FOV 24,
// warm low sun, cool hemisphere fill, PCF soft shadows, bloom + SMAA only (bright style: no tone-map pass, no AO pass).
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, VignetteEffect } from "postprocessing";
import { U, inkU } from "./shading";

const QS = new URLSearchParams(location.search);

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(24, 1, 1, 220);
  composer: EffectComposer;
  renderPass: RenderPass;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
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
    this.sun = new THREE.DirectionalLight("#ffe0b0", Number(QS.get("sun") ?? 7.0));
    const sh = this.sun.shadow; this.sun.castShadow = true; sh.mapSize.set(4096, 4096); sh.radius = 3; sh.bias = -0.0004; sh.normalBias = 0.03;
    Object.assign(sh.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 100 });
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Number(QS.get("sunel") ?? 35)), THREE.MathUtils.degToRad(Number(QS.get("sunaz") ?? 160)));
    this.hemi = new THREE.HemisphereLight("#a9c4ff", "#4a3e2e", Number(QS.get("fill") ?? 0.9));
    s.add(this.sun, this.sun.target, this.hemi);
    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType });
    this.renderPass = new RenderPass(s, this.camera); this.composer.addPass(this.renderPass);
    this.composer.addPass(new EffectPass(this.camera, new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.95, intensity: 0.4 }), new VignetteEffect({ offset: 0.42, darkness: 0.28 }), new SMAAEffect()));
    addEventListener("resize", () => this.resize()); this.resize();
  }
  /** switch the rendered scene; the sun and fill move with it */
  setScene(s: THREE.Scene, fog = true) {
    s.add(this.sun, this.sun.target, this.hemi);
    if (!s.background) s.background = (this.scene.background as THREE.Color)?.clone() ?? new THREE.Color("#d9cfa8");
    if (fog && !s.fog && this.scene.fog) s.fog = (this.scene.fog as THREE.Fog).clone();
    this.scene = s; this.renderPass.mainScene = s;
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false); this.composer.setSize(innerWidth, innerHeight); inkU.uRes.value.set(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.fov = this.camera.aspect < 1 ? 34 : 24; this.camera.updateProjectionMatrix();
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
    const texel = 48 / 4096, sp = this.focus.clone();
    sp.x = Math.round(sp.x / texel) * texel; sp.z = Math.round(sp.z / texel) * texel;
    this.sun.position.copy(sp).addScaledVector(this.sunDir, 45); this.sun.target.position.copy(sp);
    U.uRimDir.value.set(-0.55, 0.65, 0.35).normalize();
  }
  render(dt: number) { this.renderer.info.reset(); if (this.post) this.composer.render(dt); else this.renderer.render(this.scene, this.camera); }
  /** world point under the mouse on the plane y = h */
  pick(ndcX: number, ndcY: number, h = 0.9) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const p = new THREE.Vector3(); rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), p); return p;
  }
}
