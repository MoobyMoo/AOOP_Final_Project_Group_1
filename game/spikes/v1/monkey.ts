// Ink-outline monkey cards drawn to a canvas, matching the channel cast (round orange-brown head,
// peach face, big ears). Each character is a camera-facing plane with this texture; expressions redraw it.
import * as THREE from "three";

export const INK = "#2a1a12";
export type Expr = "happy" | "neutral" | "wow" | "angry" | "blink";
export type Look = { fur: string; suit: string; tie?: string; hat?: "bowler" | "cap" | "none"; hatBand?: string; shades?: boolean };

const W = 256, H = 320;

export function drawMonkey(ctx: CanvasRenderingContext2D, look: Look, expr: Expr) {
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const stroke = (w = 9) => { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke(); };
  const fill = (c: string) => { ctx.fillStyle = c; ctx.fill(); };
  const circle = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };

  // body / suit
  ctx.beginPath();
  ctx.moveTo(70, 300); ctx.quadraticCurveTo(64, 205, 128, 200); ctx.quadraticCurveTo(192, 205, 186, 300); ctx.closePath();
  fill(look.suit); stroke();
  if (look.tie) {
    ctx.beginPath(); ctx.moveTo(116, 206); ctx.lineTo(140, 206); ctx.lineTo(128, 220); ctx.closePath(); fill("#fff6e6"); stroke(5);
    ctx.beginPath(); ctx.moveTo(122, 220); ctx.lineTo(134, 220); ctx.lineTo(138, 268); ctx.lineTo(128, 280); ctx.lineTo(118, 268); ctx.closePath(); fill(look.tie); stroke(5);
  }
  // ears
  for (const x of [52, 204]) { circle(x, 128, 30); fill(look.fur); stroke(); circle(x, 128, 17); fill("#f2c08f"); }
  // head
  circle(128, 122, 78); fill(look.fur); stroke();
  // face mask
  ctx.beginPath();
  ctx.ellipse(104, 112, 34, 32, 0, 0, Math.PI * 2);
  ctx.ellipse(152, 112, 34, 32, 0, 0, Math.PI * 2);
  fill("#f2c08f");
  ctx.beginPath(); ctx.ellipse(128, 150, 56, 38, 0, 0, Math.PI * 2); fill("#f2c08f");

  // eyes
  ctx.fillStyle = INK; ctx.strokeStyle = INK;
  if (look.shades) {
    for (const x of [100, 156]) { ctx.beginPath(); ctx.roundRect(x - 26, 100, 52, 30, 12); fill("#2b2630"); stroke(5); }
    ctx.beginPath(); ctx.moveTo(126, 110); ctx.lineTo(130, 110); stroke(6);
    ctx.beginPath(); ctx.moveTo(84, 108); ctx.lineTo(94, 120); ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 5; ctx.stroke();
  } else if (expr === "blink" || expr === "happy") {
    for (const x of [104, 152]) { ctx.beginPath(); ctx.arc(x, 116, 11, Math.PI * 1.1, Math.PI * 1.9); stroke(7); }
  } else {
    const r = expr === "wow" ? 10 : 8;
    for (const x of [104, 152]) { circle(x, 114, r); fill(INK); circle(x + 3, 110, 3); fill("#fff"); }
    if (expr === "angry") { for (const [a, b] of [[88, 96], [168, 96]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + (a < 128 ? 26 : -26), b + 10); stroke(7); } }
  }
  // mouth
  ctx.beginPath();
  if (expr === "wow") { ctx.ellipse(128, 160, 12, 15, 0, 0, Math.PI * 2); fill("#7a2f22"); stroke(6); }
  else if (expr === "angry") { ctx.moveTo(108, 166); ctx.quadraticCurveTo(128, 150, 148, 166); stroke(7); }
  else if (expr === "neutral") { ctx.moveTo(112, 160); ctx.lineTo(144, 160); stroke(7); }
  else { ctx.moveTo(104, 152); ctx.quadraticCurveTo(128, 178, 152, 152); stroke(7); }

  // hats
  if (look.hat === "bowler") {
    ctx.beginPath(); ctx.ellipse(128, 62, 82, 16, 0, 0, Math.PI * 2); fill("#2b2630"); stroke();
    ctx.beginPath(); ctx.moveTo(72, 62); ctx.quadraticCurveTo(72, 4, 128, 4); ctx.quadraticCurveTo(184, 4, 184, 62); ctx.closePath(); fill("#2b2630"); stroke();
    ctx.beginPath(); ctx.moveTo(74, 46); ctx.quadraticCurveTo(128, 58, 182, 46); ctx.lineTo(183, 58); ctx.quadraticCurveTo(128, 70, 73, 58); ctx.closePath(); fill(look.hatBand ?? "#ff8a2a"); stroke(4);
  } else if (look.hat === "cap") {
    ctx.beginPath(); ctx.moveTo(62, 72); ctx.quadraticCurveTo(70, 20, 128, 20); ctx.quadraticCurveTo(186, 20, 194, 72); ctx.closePath(); fill(look.hatBand ?? "#d9493a"); stroke();
    ctx.beginPath(); ctx.ellipse(170, 72, 50, 11, 0, 0, Math.PI * 2); fill(look.hatBand ?? "#d9493a"); stroke(6);
  }
}

/** A camera-facing monkey with its own canvas texture; call setExpr to redraw. */
export class MonkeyCard {
  group = new THREE.Group();
  plane: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private expr: Expr = "happy";
  private blinkT = Math.random() * 3;
  constructor(public look: Look, public height = 1.6) {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    this.ctx = c.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(height * (W / H), height);
    geo.translate(0, height / 2, 0);
    this.plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide }));
    this.group.add(this.plane);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(height * 0.28, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01;
    this.group.add(shadow);
    this.redraw();
  }
  setExpr(e: Expr) { if (e !== this.expr) { this.expr = e; this.redraw(); } }
  getExpr() { return this.expr; }
  private redraw(blink = false) { drawMonkey(this.ctx, this.look, blink && !this.look.shades ? "blink" : this.expr); this.tex.needsUpdate = true; }
  /** blinks, faces the camera (yaw only) */
  tick(dt: number, cam: THREE.Camera) {
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.redraw(true); setTimeout(() => this.redraw(), 110); this.blinkT = 1.5 + Math.random() * 3; }
    const p = new THREE.Vector3(); cam.getWorldPosition(p);
    this.plane.rotation.y = Math.atan2(p.x - this.group.position.x, p.z - this.group.position.z);
  }
}
