// Ink-outline monkey cards drawn to a canvas, matching the channel cast (round orange-brown head,
// peach face, big ears). Each character is a camera-facing card standing in the 3D world.
// Hierarchy: group (ground position) -> pivot (faces camera) -> body (bob / squash) -> plane (flip).
import * as THREE from "three";

export const INK = "#2a1a12";
export type Expr = "happy" | "neutral" | "wow" | "angry" | "blink";
export type Look = {
  fur: string; suit: string; tie?: string; hat?: "bowler" | "cap" | "chef" | "none"; hatBand?: string;
  shades?: boolean; apron?: string;
};

const W = 256, H = 320;

export function drawMonkey(ctx: CanvasRenderingContext2D, look: Look, expr: Expr) {
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const stroke = (w = 9) => { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke(); };
  const fill = (c: string) => { ctx.fillStyle = c; ctx.fill(); };
  const circle = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };

  // legs + feet so customers read as whole characters from a high camera
  for (const x of [104, 152]) { ctx.beginPath(); ctx.roundRect(x - 13, 270, 26, 34, 8); fill("#3a2a22"); stroke(6); }
  // body / suit
  ctx.beginPath();
  ctx.moveTo(72, 290); ctx.quadraticCurveTo(66, 200, 128, 196); ctx.quadraticCurveTo(190, 200, 184, 290); ctx.closePath();
  fill(look.suit); stroke();
  if (look.apron) { ctx.beginPath(); ctx.roundRect(98, 214, 60, 76, 10); fill(look.apron); stroke(5); }
  if (look.tie) {
    ctx.beginPath(); ctx.moveTo(116, 202); ctx.lineTo(140, 202); ctx.lineTo(128, 216); ctx.closePath(); fill("#fff6e6"); stroke(5);
    ctx.beginPath(); ctx.moveTo(122, 216); ctx.lineTo(134, 216); ctx.lineTo(138, 262); ctx.lineTo(128, 274); ctx.lineTo(118, 262); ctx.closePath(); fill(look.tie); stroke(5);
  }
  // ears
  for (const x of [52, 204]) { circle(x, 124, 30); fill(look.fur); stroke(); circle(x, 124, 17); fill("#f2c08f"); }
  // head + face mask
  circle(128, 118, 78); fill(look.fur); stroke();
  ctx.beginPath(); ctx.ellipse(104, 108, 34, 32, 0, 0, Math.PI * 2); ctx.ellipse(152, 108, 34, 32, 0, 0, Math.PI * 2); fill("#f2c08f");
  ctx.beginPath(); ctx.ellipse(128, 146, 56, 38, 0, 0, Math.PI * 2); fill("#f2c08f");

  // eyes
  if (look.shades) {
    for (const x of [100, 156]) { ctx.beginPath(); ctx.roundRect(x - 26, 96, 52, 30, 12); fill("#2b2630"); stroke(5); }
    ctx.beginPath(); ctx.moveTo(126, 106); ctx.lineTo(130, 106); stroke(6);
    ctx.beginPath(); ctx.moveTo(84, 104); ctx.lineTo(94, 116); ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 5; ctx.stroke();
  } else if (expr === "blink" || expr === "happy") {
    for (const x of [104, 152]) { ctx.beginPath(); ctx.arc(x, 112, 11, Math.PI * 1.1, Math.PI * 1.9); stroke(7); }
  } else {
    const r = expr === "wow" ? 10 : 8;
    for (const x of [104, 152]) { circle(x, 110, r); fill(INK); circle(x + 3, 106, 3); fill("#fff"); }
    if (expr === "angry") for (const a of [88, 168]) { ctx.beginPath(); ctx.moveTo(a, 92); ctx.lineTo(a + (a < 128 ? 26 : -26), 102); stroke(7); }
  }
  // mouth
  ctx.beginPath();
  if (expr === "wow") { ctx.ellipse(128, 156, 12, 15, 0, 0, Math.PI * 2); fill("#7a2f22"); stroke(6); }
  else if (expr === "angry") { ctx.moveTo(108, 162); ctx.quadraticCurveTo(128, 146, 148, 162); stroke(7); }
  else if (expr === "neutral") { ctx.moveTo(112, 156); ctx.lineTo(144, 156); stroke(7); }
  else { ctx.moveTo(104, 148); ctx.quadraticCurveTo(128, 174, 152, 148); stroke(7); }

  // hats
  if (look.hat === "bowler") {
    ctx.beginPath(); ctx.ellipse(128, 58, 82, 16, 0, 0, Math.PI * 2); fill("#2b2630"); stroke();
    ctx.beginPath(); ctx.moveTo(72, 58); ctx.quadraticCurveTo(72, 2, 128, 2); ctx.quadraticCurveTo(184, 2, 184, 58); ctx.closePath(); fill("#2b2630"); stroke();
    ctx.beginPath(); ctx.moveTo(74, 42); ctx.quadraticCurveTo(128, 54, 182, 42); ctx.lineTo(183, 54); ctx.quadraticCurveTo(128, 66, 73, 54); ctx.closePath(); fill(look.hatBand ?? "#ff8a2a"); stroke(4);
  } else if (look.hat === "cap") {
    ctx.beginPath(); ctx.moveTo(62, 68); ctx.quadraticCurveTo(70, 16, 128, 16); ctx.quadraticCurveTo(186, 16, 194, 68); ctx.closePath(); fill(look.hatBand ?? "#d9493a"); stroke();
    ctx.beginPath(); ctx.ellipse(170, 68, 50, 11, 0, 0, Math.PI * 2); fill(look.hatBand ?? "#d9493a"); stroke(6);
  } else if (look.hat === "chef") {
    for (const [x, r] of [[96, 26], [128, 32], [160, 26]] as const) { circle(x, 30, r); fill("#ffffff"); stroke(6); }
    ctx.beginPath(); ctx.roundRect(84, 34, 88, 30, 6); fill("#ffffff"); stroke(6);
  }
}

/** A camera-facing monkey with its own canvas texture; call setExpr to redraw. */
export class MonkeyCard {
  group = new THREE.Group();
  pivot = new THREE.Group();
  body = new THREE.Group();
  plane: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private expr: Expr = "happy";
  private blinkT = Math.random() * 3;
  private flip = 1;
  private walkPh = Math.random() * 6;
  constructor(public look: Look, public height = 1.6) {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    this.ctx = c.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(height * (W / H), height);
    geo.translate(0, height / 2, 0);
    this.plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide }));
    this.body.add(this.plane);
    this.pivot.add(this.body);
    this.group.add(this.pivot);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(height * 0.26, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
    this.group.add(shadow);
    this.redraw();
  }
  setExpr(e: Expr) { if (e !== this.expr) { this.expr = e; this.redraw(); } }
  /** briefly show an expression, then return to happy */
  flash(e: Expr, ms = 600) { this.setExpr(e); setTimeout(() => this.setExpr("happy"), ms); }
  private redraw(blink = false) { drawMonkey(this.ctx, this.look, blink && !this.look.shades ? "blink" : this.expr); this.tex.needsUpdate = true; }
  /** blinks, leans back toward the high camera, faces its walking direction, bobs while moving */
  tick(dt: number, cam: THREE.Camera, vel: THREE.Vector3) {
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.redraw(true); setTimeout(() => this.redraw(), 110); this.blinkT = 1.5 + Math.random() * 3; }
    const p = new THREE.Vector3(); cam.getWorldPosition(p);
    const yaw = Math.atan2(p.x - this.group.position.x, p.z - this.group.position.z);
    this.pivot.rotation.set(-0.42, yaw, 0, "YXZ");
    const speed = Math.hypot(vel.x, vel.z);
    if (Math.abs(vel.x) > 0.3) this.flip = vel.x > 0 ? 1 : -1;
    this.plane.scale.x += (this.flip - this.plane.scale.x) * Math.min(1, dt * 14);
    if (speed > 0.2) {
      this.walkPh += dt * (8 + speed * 1.6);
      this.body.position.y = Math.abs(Math.sin(this.walkPh)) * 0.12;
      this.body.rotation.z = Math.sin(this.walkPh) * 0.06;
    } else {
      this.body.position.y *= 0.8; this.body.rotation.z *= 0.8;
      this.walkPh += dt * 2.2;
      this.body.scale.y = 1 + Math.sin(this.walkPh) * 0.012;
    }
  }
  dispose() { this.tex.dispose(); (this.plane.material as THREE.Material).dispose(); this.plane.geometry.dispose(); }
}
