// The Shorts monkey cast as real 3D toy-like characters, built from rounded primitives in code.
// Design source: src/monkey.ts (round orange-brown head, peach face, big ears) and the Businessman's
// bowler with orange band, dark shades, dark suit, orange tie. Chibi proportions: the head is ~45% of height.
// Procedural animation: walk cycle, idle breath, tail sway, head look, hurt flash.
import * as THREE from "three";
import { mat } from "./shading";

export type MonkeyStyle = {
  fur: string; face: string; suit: string; pants?: string; tie?: string; hat?: "bowler" | "bandana" | "cap" | "none"; hatColor?: string; band?: string;
  shades?: boolean; mask?: boolean; stripes?: boolean; sack?: boolean; briefcase?: boolean; scale?: number; rim?: number;
};

const S = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
let RIM = 0.65;
function part(geo: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, o: Parameters<typeof mat>[1] = {}) {
  const m = new THREE.Mesh(geo, mat(color, { rough: 0.72, rim: RIM, ...o }));
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function stripeTex(a: string, b: string) {
  const c = document.createElement("canvas"); c.width = 16; c.height = 64; const x = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? a : b; x.fillRect(0, i * 8, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}

export class Monkey3D {
  root = new THREE.Group();     // ground position + facing
  body = new THREE.Group();     // bob / squash
  head = new THREE.Group();
  armL = new THREE.Group(); armR = new THREE.Group(); legL = new THREE.Group(); legR = new THREE.Group();
  tail: THREE.Mesh;
  meshes: THREE.Mesh[] = [];
  private ph = Math.random() * 6; private flashT = 0;
  outline = new THREE.Group();
  constructor(public st: MonkeyStyle) {
    const k = st.scale ?? 1; RIM = st.rim ?? 0.75;
    this.root.scale.setScalar(k);
    this.root.add(this.body);
    const b = this.body;
    // legs (pivot at the hip)
    for (const [leg, x] of [[this.legL, -0.17], [this.legR, 0.17]] as const) {
      leg.position.set(x, 0.42, 0); b.add(leg);
      part(new THREE.CapsuleGeometry(0.11, 0.2, 6, 12), st.pants ?? st.suit, leg, 0, -0.2, 0);
      part(S(0.14, 14, 10), "#3a2a22", leg, 0, -0.36, 0.05, 1, 0.6, 1.35); // shoe
    }
    // torso: a soft pear in the suit colour
    const torso = part(S(0.36, 24, 18), st.suit, b, 0, 0.72, 0, 1, 1.12, 0.86);
    if (st.stripes) { const m = (torso.material as THREE.MeshStandardMaterial).clone(); m.map = stripeTex("#f3eadb", "#2f2a36"); m.color.set("#ffffff"); torso.material = m; }
    if (st.tie) {
      part(S(0.2, 16, 12), "#fff6e6", b, 0, 0.86, 0.2, 0.7, 1, 0.5); // shirt front
      part(new THREE.ConeGeometry(0.1, 0.12, 3), "#fff6e6", b, 0, 1.0, 0.27, 1, 1, 0.5).rotation.x = Math.PI; // collar
      const tie = part(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), st.tie, b, 0, 0.8, 0.31, 1, 1, 0.5); tie.rotation.x = -0.25;
    }
    // arms (pivot at the shoulder)
    for (const [arm, x] of [[this.armL, -0.38], [this.armR, 0.38]] as const) {
      arm.position.set(x, 0.92, 0); b.add(arm);
      part(new THREE.CapsuleGeometry(0.09, 0.26, 6, 12), st.suit, arm, 0, -0.2, 0).rotation.z = x < 0 ? -0.18 : 0.18;
      arm.rotation.z = x < 0 ? -0.35 : 0.35;
      part(S(0.11, 14, 10), st.face, arm, x < 0 ? -0.05 : 0.05, -0.42, 0.02);
    }
    if (st.briefcase) { // the briefcase hangs from the right hand
      const bc = new THREE.Group(); bc.position.set(0.06, -0.55, 0.04); this.armR.add(bc);
      part(new THREE.BoxGeometry(0.34, 0.26, 0.1), "#5a3a26", bc, 0, -0.1, 0, 1, 1, 1, { rough: 0.55 });
      part(new THREE.TorusGeometry(0.06, 0.018, 6, 12, Math.PI), "#2a1f1a", bc, 0, 0.04, 0);
      part(new THREE.BoxGeometry(0.06, 0.03, 0.11), "#d9b24a", bc, 0, -0.02, 0, 1, 1, 1, { rough: 0.35 });
    }
    if (st.sack) part(S(0.3, 16, 12), "#a8875a", b, 0, 0.82, -0.36, 1, 1.1, 0.8);
    // tail: a curl behind
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.55, -0.28), new THREE.Vector3(0.1, 0.42, -0.6), new THREE.Vector3(0.35, 0.6, -0.9), new THREE.Vector3(0.55, 1.0, -0.85), new THREE.Vector3(0.5, 1.22, -0.6), new THREE.Vector3(0.36, 1.12, -0.5)]);
    this.tail = part(new THREE.TubeGeometry(curve, 32, 0.075, 10), st.fur, b);
    // head
    this.head.position.set(0, 1.42, 0.02); b.add(this.head);
    const h = this.head;
    part(S(0.44, 32, 24), st.fur, h, 0, 0, 0, 1, 0.95, 0.95);
    for (const x of [-1, 1]) { // ears
      part(S(0.17, 18, 14), st.fur, h, x * 0.44, 0.02, -0.04, 1, 1, 0.55);
      part(S(0.1, 14, 10), st.face, h, x * 0.47, 0.02, 0.03, 1, 1, 0.35);
    }
    // the peach face: two eye patches + a muzzle (the channel cast's face shape)
    for (const x of [-1, 1]) part(S(0.17, 20, 16), st.face, h, x * 0.13, 0.06, 0.3, 1, 1.05, 0.55);
    part(S(0.22, 24, 18), st.face, h, 0, -0.14, 0.3, 1.15, 0.78, 0.62);
    part(S(0.035, 10, 8), "#3a2420", h, -0.045, -0.06, 0.46); part(S(0.035, 10, 8), "#3a2420", h, 0.045, -0.06, 0.46); // nostrils
    const smile = part(new THREE.TorusGeometry(0.075, 0.016, 6, 16, Math.PI * 0.8), "#3a2420", h, 0, -0.16, 0.43); smile.rotation.z = Math.PI * 1.1;
    if (st.shades) {
      for (const x of [-1, 1]) { const g = part(new THREE.CapsuleGeometry(0.075, 0.07, 6, 12), "#1e1b24", h, x * 0.13, 0.08, 0.43, 1.25, 1, 0.45, { rough: 0.2 }); g.rotation.z = Math.PI / 2; }
      part(new THREE.BoxGeometry(0.1, 0.025, 0.03), "#1e1b24", h, 0, 0.1, 0.45, 1, 1, 1, { rough: 0.2 });
    } else {
      for (const x of [-1, 1]) { part(S(0.06, 12, 10), "#241a18", h, x * 0.13, 0.08, 0.4, 1, 1.15, 0.6, { rough: 0.25 }); part(S(0.018, 8, 6), "#ffffff", h, x * 0.13 + 0.02, 0.11, 0.44, 1, 1, 1, { rim: 0 }); }
    }
    if (st.mask) part(new THREE.TorusGeometry(0.37, 0.07, 8, 32, Math.PI * 0.9), "#1f1a24", h, 0, 0.08, 0.04, 1, 0.55, 1).rotation.set(Math.PI / 2 - 0.15, 0, Math.PI * 0.05 + Math.PI * 1.05);
    if (st.hat === "bowler") {
      const hat = new THREE.Group(); hat.position.set(0, 0.06, -0.1); hat.rotation.x = -0.32; h.add(hat); // tipped back
      part(new THREE.CylinderGeometry(0.37, 0.37, 0.04, 32), st.hatColor ?? "#26222c", hat, 0, 0.3, 0, 1, 1, 1, { rough: 0.85, rim: 0.3 });
      part(S(0.26, 28, 18), st.hatColor ?? "#26222c", hat, 0, 0.36, 0, 1, 0.9, 1, { rough: 0.8, rim: 0.45 });
      part(new THREE.CylinderGeometry(0.265, 0.27, 0.07, 32), st.band ?? "#ff8a2a", hat, 0, 0.36, 0);
    } else if (st.hat === "bandana") {
      part(S(0.45, 28, 18, ), st.hatColor ?? "#d9493a", h, 0, 0.1, -0.02, 1.02, 0.7, 1.0).scale.y = 0.62;
      part(S(0.08, 10, 8), st.hatColor ?? "#d9493a", h, 0.1, 0.12, -0.46);
    } else if (st.hat === "cap") {
      part(S(0.43, 28, 18), st.hatColor ?? "#3a6ad1", h, 0, 0.16, 0, 1, 0.62, 1);
      part(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 24, 1, false, -Math.PI / 2, Math.PI), st.hatColor ?? "#3a6ad1", h, 0, 0.17, 0.3, 1, 1, 1.3);
    }
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) this.meshes.push(o as THREE.Mesh); });
    // optional ink outline (the Shorts signature): back-face shells on every part
    const ink = new THREE.MeshBasicMaterial({ color: 0x2a1a12, side: THREE.BackSide });
    for (const m of this.meshes) {
      const o = new THREE.Mesh(m.geometry, ink); o.scale.setScalar(1.06); o.castShadow = false;
      m.add(o); o.visible = false; this.outline.add(new THREE.Object3D()); (o as THREE.Mesh).name = "ink";
    }
    // soft contact blob under the feet
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.55 }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; this.root.add(blob);
  }
  setInk(on: boolean) { this.root.traverse((o) => { if (o.name === "ink") o.visible = on; }); }
  flash() { this.flashT = 0.12; }
  /** speed in u/s; face is the heading (radians) */
  update(dt: number, speed: number, face: number) {
    const r = this.root;
    let d = face - r.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    r.rotation.y += d * Math.min(1, dt * 12);
    const move = Math.min(1, speed / 4);
    this.ph += dt * (2.2 + speed * 2.1);
    const s = Math.sin(this.ph), c = Math.cos(this.ph);
    this.legL.rotation.x = s * 0.7 * move; this.legR.rotation.x = -s * 0.7 * move;
    this.armL.rotation.x = -s * 0.6 * move; this.armR.rotation.x = s * 0.45 * move;
    this.body.position.y = Math.abs(c) * 0.07 * move + (1 - move) * Math.sin(this.ph * 0.5) * 0.012;
    this.body.rotation.z = s * 0.05 * move; this.body.rotation.x = 0.08 * move;
    this.head.rotation.z = -s * 0.04 * move; this.head.rotation.x = -0.22 - 0.05 * move;
    this.tail.rotation.y = Math.sin(this.ph * 0.6) * 0.25; this.tail.rotation.x = Math.sin(this.ph * 0.9) * 0.08;
    if (this.flashT > 0) { this.flashT -= dt; for (const m of this.meshes) { const mm = m.material as THREE.MeshStandardMaterial; if (mm.emissive) mm.emissiveIntensity = this.flashT > 0 ? 1 : 0; } }
  }
}
let blobT: THREE.Texture | null = null;
export function blobTex() {
  if (blobT) return blobT;
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, "rgba(20,14,10,0.9)"); g.addColorStop(1, "rgba(20,14,10,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  blobT = new THREE.CanvasTexture(c); return blobT;
}
