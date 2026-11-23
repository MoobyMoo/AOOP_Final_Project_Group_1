// Keyboard + mouse input with a keyboard-only mode (Mac trackpad rule, DESIGN 4): T toggles it, and then aim
// auto-faces the nearest enemy. A still mouse keeps its aim, as in Duckov: the old 1.5 s idle switch snapped the
// crosshair onto enemies or the walking direction whenever the mouse rested (Moo 2026-11-15). The bot writes the same
// Intent object.
export type Intent = {
  move: { x: number; z: number };          // camera-relative stick, |v| <= 1
  aimNdc: { x: number; y: number } | null; // mouse in NDC, null in keyboard mode
  fire: boolean; firePressed: boolean; ads: boolean; sprint: boolean; melee: boolean; roll: boolean; interact: boolean; interactHeld: boolean; map: boolean; inv: boolean; mini: boolean;
  reload: boolean; heal: boolean; swap1: boolean; swap2: boolean; swap3: boolean; esc: boolean;
  /** mouse wheel steps this frame: +1 = down (next gun), -1 = up (combat/arsenal.ts cycleGun) */
  wheel: number;
};
export class Input {
  keys = new Set<string>(); pressed = new Set<string>();
  mouse = { x: 0, y: 0, down: false, rdown: false, clicked: false, rclicked: false, movedAt: -9 };
  kbMode = false; private t = 0; private wheelAcc = 0; private wheelT = 0;
  constructor(el: HTMLElement) {
    addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (k === "t" && !e.repeat) this.kbMode = !this.kbMode;
      if ([" ", "tab"].includes(k)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => {
      this.keys.clear();
      this.pressed.clear();
      this.mouse.down = this.mouse.rdown = false;
      this.mouse.clicked = this.mouse.rclicked = false;
      this.wheelAcc = 0;
    });
    el.addEventListener("mousemove", (e) => { this.mouse.x = (e.clientX / innerWidth) * 2 - 1; this.mouse.y = -(e.clientY / innerHeight) * 2 + 1; this.mouse.movedAt = this.t; if (this.kbMode && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) this.kbMode = false; });
    el.addEventListener("mousedown", (e) => { if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; } if (e.button === 2) { this.mouse.rdown = true; this.mouse.rclicked = true; } });
    addEventListener("mouseup", (e) => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.rdown = false; });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    // the wheel cycles guns (Duckov's ScrollWheelBehaviour "Weapon" option): one step per notch, a trackpad's stream of
    // small deltas adds up to a step, and steps are at least 0.12 s apart so a fling doesn't spin through both guns
    el.addEventListener("wheel", (e) => { this.wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; }, { passive: true });
  }
  /** usingMouse: the mouse aims unless keyboard mode is on (T); a resting mouse keeps aiming where it points */
  get usingMouse() { return !this.kbMode; }
  read(dt: number): Intent {
    this.t += dt;
    const k = this.keys, p = this.pressed;
    const x = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const z = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const l = Math.hypot(x, z) || 1;
    const i: Intent = {
      move: { x: x / l, z: z / l }, aimNdc: this.usingMouse ? { x: this.mouse.x, y: this.mouse.y } : null,
      // Duckov-style PC bindings: LMB fire, RMB aim, Space dodge, Shift sprint, V melee, F/E interact, R reload, Q heal, M map
      fire: this.mouse.down || k.has("j"), firePressed: this.mouse.clicked || p.has("j"), ads: this.mouse.rdown,
      sprint: k.has("shift"), melee: p.has("v") || p.has("k"), roll: p.has(" ") || p.has("l"),
      interact: p.has("e") || p.has("f"), interactHeld: k.has("e") || k.has("f"), reload: p.has("r"), heal: p.has("q"), map: p.has("m"), inv: p.has("tab"), mini: p.has("n"),
      swap1: p.has("1"), swap2: p.has("2"), swap3: p.has("3"), esc: p.has("escape"), wheel: 0,
    };
    if (Math.abs(this.wheelAcc) >= 50 && this.t - this.wheelT > 0.12) { i.wheel = Math.sign(this.wheelAcc); this.wheelAcc = 0; this.wheelT = this.t; }
    else if (this.t - this.wheelT > 0.4) this.wheelAcc *= 0.5;
    p.clear(); this.mouse.clicked = this.mouse.rclicked = false;
    return i;
  }
}
