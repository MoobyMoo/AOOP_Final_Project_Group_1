// STUB (lead): adapter from the L1 Monkey3D to the Rig contract, so gameplay runs before Fable A's rig v2 lands.
import * as THREE from "three";
import type { Rig, RigState, MonkeyLook, EnemyStyle } from "../contracts";
import { Monkey3D } from "./monkey3d";
export function createRig(plan: "monkey" | "gorilla", style: MonkeyLook | EnemyStyle): Rig {
  const look = "v" in style ? style : null, en = "kind" in style ? style : null;
  const m = new Monkey3D(look ? { fur: look.fur, face: look.face, suit: look.suit, pants: look.pants, tie: look.tie.color, hat: "bowler", band: look.hat.band, shades: look.eyes.style === "shades", briefcase: false, rim: 1.3 }
    : en!.kind === "bandit" ? { fur: "#8a5a34", face: "#e6b483", suit: "#ffffff", pants: "#3a3340", hat: "bandana", hatColor: "#d9493a", mask: true, stripes: true, sack: true, scale: 0.92 }
    : en!.kind === "wild" ? { fur: "#9a6a3a", face: "#e8c09a", suit: "#9a6a3a", hat: "none", scale: 0.85 }
    : { fur: "#4a4450", face: "#8a8090", suit: "#4a4450", hat: "none", scale: plan === "gorilla" ? (en!.kind === "sleeper" ? 2.4 : 1.9) : 1 });
  const s = (n: string) => { const o = new THREE.Object3D(); o.name = n; return o; };
  const sockets = { handR: s("handR"), handL: s("handL"), back: s("back"), head: s("head") };
  m.armR.add(sockets.handR); sockets.handR.position.set(0.05, -0.45, 0.08); m.armL.add(sockets.handL); m.body.add(sockets.back); m.head.add(sockets.head);
  const sc = m.root.scale.x;
  return {
    root: m.root, sockets, bounds: { radius: 0.45 * sc, height: 2.0 * sc },
    pose(st: RigState) {
      m.update(1 / 60, st.speed, st.faceYaw);
      if (st.armed === "pistol") { m.armR.rotation.x = -1.35; }
      if (st.action === "melee") m.armR.rotation.x = -2.2 + st.actionT * 3.2;
      if (st.action === "roll") m.body.rotation.x = st.actionT * Math.PI * 2;
      else if (st.action === "defeat") m.body.rotation.z = -Math.min(1, st.actionT * 3) * 1.4;
      if (st.flash > 0) m.flash();
    },
    dispose() { m.root.removeFromParent(); },
  };
}
