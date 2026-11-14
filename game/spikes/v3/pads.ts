// Floor price pads: stand on one to pay into it. Rules from research/idle-arcade 6-7:
// 0.15 s grace before draining, drain time normalized to ~1.6 s whatever the price,
// partial payments are kept forever.
import * as THREE from "three";
import { popIn, tween, burst, arc, floatText } from "./fx";
import { sfx } from "./audio";
import { makeBill } from "./items";

const GRACE = 0.15, DRAIN_TIME = 1.6, RADIUS = 1.0;

export class Pad {
  mesh: THREE.Mesh;
  paid = 0;
  done = false;
  visible = false;
  private stand = 0;
  private shownLeft = -1;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private billT = 0;
  constructor(private scene: THREE.Scene, public pos: THREE.Vector3, public cost: number, public label: string,
    public icon: string, public onUnlock: () => void, public big = false) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    this.ctx = c.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
    const s = big ? 2.3 : 1.7;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.copy(pos).setY(0.03);
    this.mesh.renderOrder = 2;
    this.draw();
  }
  get left() { return Math.max(0, this.cost - this.paid); }
  show() { if (this.visible || this.done) return; this.visible = true; this.scene.add(this.mesh); popIn(this.mesh, 0, 0.45); }
  private draw() {
    const x = this.ctx, left = Math.ceil(this.left), k = this.paid / this.cost;
    x.clearRect(0, 0, 256, 256);
    x.fillStyle = "#2a1a1255"; x.beginPath(); x.roundRect(14, 20, 228, 228, 34); x.fill();
    x.fillStyle = "#fff6e6"; x.strokeStyle = "#2a1a12"; x.lineWidth = 10;
    x.beginPath(); x.roundRect(10, 10, 236, 236, 34); x.fill(); x.stroke();
    x.save(); x.beginPath(); x.roundRect(15, 15, 226, 226, 30); x.clip();
    x.fillStyle = "#8fd18a"; x.fillRect(15, 241 - 226 * k, 226, 226 * k); x.restore();
    x.fillStyle = "#2a1a12"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "60px serif"; x.fillText(this.icon, 128, 70);
    x.font = "bold 30px Trebuchet MS"; x.fillText(this.label, 128, 130, 220);
    x.font = "bold 62px Trebuchet MS"; x.fillText("$" + left, 128, 192);
    this.tex.needsUpdate = true;
    this.shownLeft = left;
  }
  /** returns money spent this frame */
  update(dt: number, player: THREE.Vector3, wallet: number, payFrom: () => THREE.Vector3): number {
    if (!this.visible || this.done) return 0;
    const inside = Math.hypot(player.x - this.pos.x, player.z - this.pos.z) < RADIUS * (this.big ? 1.3 : 1);
    this.stand = inside ? this.stand + dt : 0;
    const pulse = 1 + Math.sin(performance.now() / 260) * (wallet >= this.left ? 0.04 : 0.01);
    this.mesh.scale.setScalar(this.mesh.scale.x > 0.95 ? pulse : this.mesh.scale.x);
    if (this.stand < GRACE || wallet <= 0) return 0;
    const spend = Math.min(this.cost / DRAIN_TIME * dt, wallet, this.left);
    this.paid += spend;
    this.billT -= dt;
    if (this.billT <= 0) {
      this.billT = 0.06;
      const b = makeBill();
      arc(b, payFrom(), () => this.pos.clone().setY(0.1), 0.18, 0.8, () => this.scene.remove(b));
      sfx("pay");
    }
    if (Math.ceil(this.left) !== this.shownLeft) this.draw();
    if (this.left <= 0.0001) this.complete();
    return spend;
  }
  private complete() {
    this.done = true;
    sfx("unlock");
    burst(this.pos.clone().setY(0.6), 22, "#ffd84a", 1.1);
    burst(this.pos.clone().setY(0.6), 12, "#fff6e6", 0.9);
    floatText(this.label + "!", this.pos.clone().setY(1.8), "#3a7a2a", 26);
    tween(0.25, (k) => this.mesh.scale.setScalar(1 - k), () => this.scene.remove(this.mesh));
    this.onUnlock();
  }
}
