// Carried goods and the carry stack. The stack is a lerp chain, not physics: item 0 follows the
// back anchor, each item i follows item i-1, so sharp turns whip the top into an S-curve
// (research/idle-arcade rules 1-3).
import * as THREE from "three";
import { inked, cyl, box } from "./toon";
import { arc, squash } from "./fx";

export type Kind = "banana" | "chips";
export const ITEM_H: Record<Kind, number> = { banana: 0.2, chips: 0.3 };

export function makeItem(kind: Kind): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === "banana") {
    const b = inked(new THREE.TorusGeometry(0.17, 0.07, 8, 14, Math.PI * 0.8), "#ffd84a", 0.035);
    b.rotation.set(Math.PI / 2, 0, Math.PI * 0.6);
    const tip = cyl(0.025, 0.025, 0.06, "#6b4a22", 0.12, -0.03, -0.06, 6);
    g.add(b, tip);
  } else {
    // a bag of banana chips: crimped top, red band, yellow chip on the front
    g.add(box(0.3, 0.26, 0.14, "#ffcc3d", 0, 0, 0));
    g.add(box(0.31, 0.05, 0.15, "#e8493a", 0, 0.12, 0));
    g.add(box(0.32, 0.04, 0.06, "#e8a417", 0, 0.26, 0));
    g.add(cyl(0.05, 0.05, 0.01, "#fff3a0", 0, 0.1, 0.075, 10).rotateX(Math.PI / 2));
  }
  return g;
}

/** a banana-print bill (Banana Bucks): the money customers pay with */
const BILL_GEO = new THREE.BoxGeometry(0.42, 0.06, 0.24);
export function makeBill(): THREE.Object3D {
  const g = inked(BILL_GEO, "#8fd18a", 0.025);
  const dot = box(0.1, 0.012, 0.1, "#ffd84a", 0, 0.03, 0); g.add(dot);
  return g;
}

type Slot = { o: THREE.Object3D; kind: Kind; pos: THREE.Vector3; landed: boolean };

export class Stack {
  slots: Slot[] = [];
  private badge: THREE.Sprite;
  constructor(private scene: THREE.Scene, private anchor: () => THREE.Vector3, public cap: number) {
    const c = document.createElement("canvas"); c.width = 128; c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "#e8493a"; x.strokeStyle = "#2a1a12"; x.lineWidth = 6;
    x.beginPath(); x.roundRect(4, 4, 120, 56, 18); x.fill(); x.stroke();
    x.fillStyle = "#fff"; x.font = "bold 36px Trebuchet MS"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("MAX", 64, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    this.badge.scale.set(0.8, 0.4, 1); this.badge.renderOrder = 20; this.badge.visible = false;
    scene.add(this.badge);
  }
  get size() { return this.slots.length; }
  get full() { return this.slots.length >= this.cap; }
  count(kind: Kind) { return this.slots.filter((s) => s.kind === kind).length; }
  private slotTarget(i: number) {
    let y = 0;
    // items can be taken while another is still in flight, so never index past the live stack
    for (let j = 0; j < Math.min(i, this.slots.length); j++) y += ITEM_H[this.slots[j].kind];
    return this.anchor().add(new THREE.Vector3(0, y, 0));
  }
  /** an item flies from a world point onto the top of the stack */
  push(kind: Kind, from: THREE.Vector3) {
    const o = makeItem(kind);
    const i = this.slots.length;
    const s: Slot = { o, kind, pos: from.clone(), landed: false };
    this.slots.push(s);
    arc(o, from, () => (s.landed ? s.pos.clone() : this.slotTarget(i)), 0.2, 0.9, () => {
      s.landed = true; s.pos.copy(this.slotTarget(i)); squash(o, 0.35, 0.22);
    });
  }
  /** take the top-most item of a kind (filtered LIFO); returns its world position for the transfer */
  take(kind: Kind): THREE.Vector3 | null {
    for (let i = this.slots.length - 1; i >= 0; i--) {
      if (this.slots[i].kind !== kind || !this.slots[i].landed) continue;
      const [s] = this.slots.splice(i, 1);
      this.scene.remove(s.o);
      return s.o.position.clone();
    }
    return null;
  }
  update(dt: number, vel: THREE.Vector3) {
    const base = this.anchor();
    let prev = base, y = 0;
    this.slots.forEach((s, i) => {
      if (!s.landed) { y += ITEM_H[s.kind]; return; }
      const target = (i === 0 ? base : prev).clone().add(new THREE.Vector3(0, i === 0 ? 0 : ITEM_H[this.slots[i - 1].kind], 0));
      const k = Math.min(1, dt * Math.max(9, 30 - i * 1.6));
      s.pos.lerp(target, k);
      // a tower, not a rope: each banana may lag its neighbour by at most a little (tall stacks stay upright)
      const off = s.pos.clone().sub(target), maxLag = 0.22;
      if (off.length() > maxLag) s.pos.copy(target).addScaledVector(off.normalize(), maxLag);
      s.o.position.copy(s.pos);
      // lean opposite to motion: the stack trails behind sharp moves
      s.o.rotation.z = THREE.MathUtils.clamp(-(s.pos.x - target.x) * 1.4 - vel.x * 0.004 * i, -0.5, 0.5);
      s.o.rotation.x = THREE.MathUtils.clamp((s.pos.z - target.z) * 1.4, -0.5, 0.5);
      prev = s.pos; y += ITEM_H[s.kind];
    });
    this.badge.visible = this.full;
    this.badge.position.copy(base).add(new THREE.Vector3(0, y + 0.45 + Math.sin(performance.now() / 160) * 0.05, 0));
  }
}
