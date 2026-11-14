// Keyboard + mouse input with a keyboard-only mode (Mac trackpad rule, DESIGN 4): if the mouse hasn't moved
// for 1.5 s (or T toggles it), aim auto-faces the nearest enemy. The bot writes the same Intent object.
export type Intent = {
  move: { x: number; z: number };          // camera-relative stick, |v| <= 1
  aimNdc: { x: number; y: number } | null; // mouse in NDC, null in keyboard mode
  fire: boolean; firePressed: boolean; melee: boolean; roll: boolean; interact: boolean; interactHeld: boolean;
  reload: boolean; heal: boolean; swap1: boolean; swap2: boolean; swap3: boolean; esc: boolean;
};
export class Input {
  keys = new Set<string>(); pressed = new Set<string>();
  mouse = { x: 0, y: 0, down: false, rdown: false, clicked: false, rclicked: false, movedAt: -9 };
  kbMode = false; private t = 0;
  constructor(el: HTMLElement) {
    addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (!this.keys.has(k)) this.pressed.add(k); this.keys.add(k); if (k === "t") this.kbMode = !this.kbMode; if ([" ", "tab"].includes(k)) e.preventDefault(); });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => { this.keys.clear(); this.mouse.down = this.mouse.rdown = false; });
    el.addEventListener("mousemove", (e) => { this.mouse.x = (e.clientX / innerWidth) * 2 - 1; this.mouse.y = -(e.clientY / innerHeight) * 2 + 1; this.mouse.movedAt = this.t; if (this.kbMode && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) this.kbMode = false; });
    el.addEventListener("mousedown", (e) => { if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; } if (e.button === 2) { this.mouse.rdown = true; this.mouse.rclicked = true; } });
    addEventListener("mouseup", (e) => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.rdown = false; });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  /** usingMouse: true while the mouse is the aim device */
  get usingMouse() { return !this.kbMode && this.t - this.mouse.movedAt < 1.5 || (!this.kbMode && this.mouse.down); }
  read(dt: number): Intent {
    this.t += dt;
    const k = this.keys, p = this.pressed;
    const x = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const z = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const l = Math.hypot(x, z) || 1;
    const i: Intent = {
      move: { x: x / l, z: z / l }, aimNdc: this.usingMouse ? { x: this.mouse.x, y: this.mouse.y } : null,
      fire: this.mouse.down || k.has("j"), firePressed: this.mouse.clicked || p.has("j"),
      melee: this.mouse.rclicked || p.has(" ") || p.has("f") || p.has("k"), roll: p.has("shift") || p.has("l"),
      interact: p.has("e"), interactHeld: k.has("e"), reload: p.has("r"), heal: p.has("q"),
      swap1: p.has("1"), swap2: p.has("2"), swap3: p.has("3"), esc: p.has("escape"),
    };
    p.clear(); this.mouse.clicked = this.mouse.rclicked = false;
    return i;
  }
}
