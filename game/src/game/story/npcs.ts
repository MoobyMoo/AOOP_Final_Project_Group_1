// The cast (LORE.md "Story in the demo" and "Factions v0.2"): who they are, how they look, what they say. Each one is
// a monkey from the player's own rig and look system (actors/rig.ts createRig("monkey", look) + wearables on the
// sockets), dressed so you can tell them apart across the vault:
//   Smuggler Sal         loud open shirt (tangerine jacket over a lime shirt), gold aviators, a fedora
//   the Fence            a banker's waistcoat over white shirt sleeves, a green eyeshade visor, red sleeve garters
//   the Radio Operator   a mustard knitted cardigan, the radio headset, a tired face
//   the Grove Keeper     the island's invented first folk: a woven palm-leaf mask, banana-fibre wraps, a glowing
//                        seed-pod lantern. Nothing here is drawn from any real culture's dress, art or symbols.
// The extras (visor, garters, mask, lantern) are small procedural meshes on the rig's sockets and arm bones.
import * as THREE from "three";
import type { Gear, SaveV1 } from "../contracts";
import { createRig } from "../actors/rig";
import { DEFAULT_LOOK, type MonkeyLookX } from "../actors/look";
import { mat } from "../render/shading";
import { qs, unlocked, type NpcId } from "../core/quests";

export type NpcDef = { id: NpcId; name: string; role: string; look: MonkeyLookX; gear: Gear; dress?: (root: THREE.Object3D, sockets: ReturnType<typeof createRig>["sockets"]) => void };
const L = (o: Partial<MonkeyLookX>, x: MonkeyLookX["x"]): MonkeyLookX => ({ ...structuredClone(DEFAULT_LOOK), ...o, x });
const none: Gear = { head: null, face: null, body: null, back: null, ears: null };

// ---------------------------------------------------------------- outfit extras
function visor(sockets: NpcSockets) {
  // the banker's eyeshade: a band round the brow and a deep green translucent brim over the eyes (face socket = between the eyes)
  const g = new THREE.Group(); g.name = "npc_visor";
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 32, Math.PI * 1.2), mat("#1f4a2c")); band.rotation.set(Math.PI / 2, 0, -Math.PI * 0.1 + Math.PI); band.position.set(0, 0.16, -0.16); g.add(band);
  const brim = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.42, 28, 1, Math.PI * 1.08, Math.PI * 0.84), new THREE.MeshStandardMaterial({ color: "#2fc46a", transparent: true, opacity: 0.82, roughness: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  brim.rotation.x = -Math.PI / 2 + 0.38; brim.position.set(0, 0.17, -0.12); brim.renderOrder = 2; g.add(brim);
  sockets.face.add(g);
}
function garters(root: THREE.Object3D) {
  // red elastic sleeve garters on both upper arms (the waistcoat's shirt sleeves show)
  for (const side of ["L", "R"]) {
    const arm = root.getObjectByName(`upperarm_${side}`); if (!arm) continue;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 18), mat("#d9493a")); ring.rotation.x = Math.PI / 2; ring.position.y = 0.11; ring.name = "npc_garter"; arm.add(ring);
  }
}
function mask(sockets: NpcSockets) {
  // the woven palm-leaf mask: an oval of straw-gold leaf weave over the face, two dark eye slits, a short crest of fronds
  const g = new THREE.Group(); g.name = "npc_mask";
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ color: "#c9b06a", roughness: 0.9, side: THREE.DoubleSide }));
  shell.rotation.x = Math.PI / 2; shell.scale.set(1.15, 0.5, 1.3); shell.position.set(0, -0.02, 0.02); g.add(shell);
  for (let i = 0; i < 5; i++) { // horizontal weave strips laid on the shell
    const y = -0.18 + i * 0.075, w = Math.sqrt(Math.max(0.01, 1 - (y / 0.27) ** 2)) * 0.36;
    const st = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, 0.03, 0.02), mat(i % 2 ? "#a88a3a" : "#e0c87a")); st.position.set(0, y, 0.12 - Math.abs(y) * 0.12); g.add(st);
  }
  for (const x of [-0.075, 0.075]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.026, 0.02), mat("#1c1814")); eye.position.set(x, 0.035, 0.14); g.add(eye); }
  for (let i = 0; i < 5; i++) { // a crest of fronds over the brow
    const a = -0.6 + i * 0.3, f = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.16, 4), mat(i % 2 ? "#5a8a3a" : "#7aa84a"));
    f.position.set(Math.sin(a) * 0.17, 0.27 + Math.cos(a) * 0.03, 0.04); f.rotation.z = -a * 0.8; g.add(f);
  }
  sockets.face.add(g);
}
function lantern(sockets: NpcSockets) {
  // a glowing seed pod on a fibre cord in the left hand
  const g = new THREE.Group(); g.name = "npc_lantern";
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), mat("#6a5a3a")); cord.position.y = -0.11; g.add(cord);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color("#9dffb0").multiplyScalar(1.6), toneMapped: false })); pod.scale.set(0.85, 1.25, 0.85); pod.position.y = -0.3; g.add(pod);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.08, 6), mat("#5a4a2a")); cap.position.y = -0.17; cap.rotation.x = Math.PI; g.add(cap);
  sockets.handL.add(g);
}
function wraps(root: THREE.Object3D) {
  // banana-fibre wraps on the forearms
  for (const side of ["L", "R"]) {
    const arm = root.getObjectByName(`forearm_${side}`); if (!arm) continue;
    for (let k = 0; k < 2; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 5, 14), mat(k ? "#d8c48a" : "#b89a5a")); r.rotation.x = Math.PI / 2; r.position.y = 0.05 + k * 0.07; arm.add(r); }
  }
}
type NpcSockets = ReturnType<typeof createRig>["sockets"] & { face: THREE.Object3D };

export const NPCS: Record<NpcId, NpcDef> = {
  sal: { id: "sal", name: "Smuggler Sal", role: "Fixer, smuggler, notary. Mostly smuggler.",
    look: L({ fur: "#9a6a3e", face: "#efc79a", suit: "#ff7a2e", pants: "#3d3a52", tie: { style: "none", color: "#ffd84a" }, eyes: { style: "sleepy", spacing: 1.02 }, brows: { style: "bushy", tilt: 0.7 }, mouth: "grin", ears: { style: "pointy", size: 1.05 }, feet: { style: "shoes", color: "#f3eadb" }, tail: { curl: 0.9 } },
      { build: 0.45, jacket: "open", colors: { shirt: "#9be04a", buttons: "#ffd84a" } }),
    gear: { head: "fedora", face: "aviators", body: null, back: null, ears: null } },
  fence: { id: "fence", name: "The Fence", role: "Ex-banker. Buys anything. Asks nothing. Sweats a lot.",
    look: L({ fur: "#b8a48a", face: "#f2dcc4", suit: "#3d5a4a", pants: "#2c2c34", tie: { style: "bowtie", color: "#7a1f2a" }, eyes: { style: "round", spacing: 0.9 }, brows: { style: "thin", tilt: -0.8 }, mouth: "whistle", ears: { style: "floppy", size: 0.9 }, headSize: 0.06, feet: { style: "shoes", color: "#2a2024" }, tail: { curl: 0.3 } },
      { build: -0.6, jacket: "vest", colors: { shirt: "#f6f2ea", buttons: "#e8b84a" } }),
    gear: none, dress: (root, s) => { visor(s as NpcSockets); garters(root); } },
  radio: { id: "radio", name: "Dial", role: "The Radio Operator. Hears every gang. Sleeps in the headset.",
    look: L({ fur: "#6a5248", face: "#e3c2a2", suit: "#c99a3a", pants: "#4a4038", tie: { style: "none", color: "#c99a3a" }, eyes: { style: "sleepy", spacing: 0.96 }, brows: { style: "bold", tilt: -0.3 }, mouth: "smirk", ears: { style: "round", size: 1.2 }, feet: { style: "round", color: "#4a3a2c" }, tail: { curl: 0.5 } },
      { build: 0.7, jacket: "open", colors: { shirt: "#5a7a8a", buttons: "#7a5a2a" } }),
    gear: { head: null, face: null, body: null, back: null, ears: "radio_headset" } },
  keeper: { id: "keeper", name: "Keeper Wren", role: "A Grove Keeper, the island's first folk. Trades by the water.",
    look: L({ fur: "#7f8a6a", face: "#e8d6ae", suit: "#d8c48a", pants: "#a88a54", tie: { style: "none", color: "#d8c48a" }, eyes: { style: "beady", spacing: 1.05 }, brows: { style: "none", tilt: 0 }, mouth: "smile", ears: { style: "round", size: 1.1 }, feet: { style: "round", color: "#6a5a3c" }, tail: { curl: 1 } },
      { build: -0.3, jacket: "vest", colors: { shirt: "#b89a5a", buttons: "#7aa84a" } }),
    gear: none, dress: (root, s) => { mask(s as NpcSockets); lantern(s as NpcSockets); wraps(root); } },
};

/** a dressed rig for an NPC (each call is its own rig: the vault, a portrait) */
export function npcRig(id: NpcId) {
  const d = NPCS[id], rig = createRig("monkey", d.look);
  rig.setGear?.(d.gear);
  d.dress?.(rig.root, rig.sockets);
  rig.root.name = `npc_${id}`;
  return rig;
}

// ---------------------------------------------------------------- what they say (short, punchy, LORE.md voice)
type Line = { when: (s: SaveV1) => boolean; text: string };
const done = (s: SaveV1, id: string) => qs(s).done.includes(id);
/** greetings by milestone, latest first: the dialogue panel's first line when there's no job to talk about */
export const GREET: Record<NpcId, Line[]> = {
  sal: [
    { when: (s) => done(s, "sal_payroll"), text: "Partner! Knucklebark's still looking for his payroll. Under every rock. Wrong rocks." },
    { when: (s) => s.salMovedIn, text: "Ammo, bandages, smoothies. Prices are fair. Fair to me." },
    { when: (s) => s.stats.extracts > 0, text: "You came back! Most don't. Bad for business." },
    { when: () => true, text: "Psst. New fish. Over here. I don't bite. I invoice." },
  ],
  fence: [
    { when: (s) => s.money >= 400, text: "That's a lot of bananas. Have you considered a smaller, quieter number?" },
    { when: (s) => s.stats.extracts > 0, text: "I don't ask where it came from. I ask how much." },
    { when: () => true, text: "I used to run a bank. Now I run a window. It's the same job with fewer lawyers." },
  ],
  radio: [
    { when: (s) => done(s, "sal_payroll"), text: "Every gang on the island just said your name. Mostly nicely." },
    { when: (s) => done(s, "radio_flare"), text: "Rum Runners on channel nine. They like green. They like you less." },
    { when: () => true, text: "...copy that, the bandits lost another boomerang. Oh. Hey." },
  ],
  keeper: [
    { when: (s) => done(s, "keeper_lanterns"), text: "The lanterns remember you, suit-wearer. That is rare for a suit." },
    { when: () => true, text: "Walk soft. The island was here before the walls." },
  ],
};
/** idle barks in the vault, keyed to milestones (said once each, when you walk near) */
export const BARKS: Record<NpcId, (Line & { id: string })[]> = {
  sal: [
    { id: "sal-new", when: (s) => s.stats.extracts === 0, text: "Psst! You! The suit! Over here." },
    { id: "sal-back", when: (s) => s.stats.extracts > 0 && !qs(s).done.includes("sal_roadmap"), text: "Alive AND carrying? Talk to me." },
    { id: "sal-bonk", when: (s) => s.stats.bonkOuts > 0, text: "Bonked? Happens. Usually to other people." },
    { id: "sal-boss", when: (s) => done(s, "sal_payroll"), text: "I'm framing a banana from that payroll." },
  ],
  fence: [
    { id: "fence-wall", when: (s) => !s.base.items.some((i) => i.def === "fence"), text: "Build me a window. I can't fence through a wall." },
    { id: "fence-goods", when: (s) => s.reserved.length > 0, text: "I smell merchandise. Unrelated: I smell nothing." },
    { id: "fence-rich", when: (s) => s.money >= 400, text: "Have you considered a tax-free vault? Asking for me." },
  ],
  radio: [
    { id: "radio-hi", when: () => true, text: "Testing, testing. Is this thing on? Is that a banana?" },
    { id: "radio-cove", when: (s) => unlocked(s, "dest:plantation"), text: "Chatter says the foreman wants his map back. Ha." },
    { id: "radio-flare", when: (s) => done(s, "radio_flare"), text: "Pirates on nine, bandits on four, my mum on two." },
    { id: "radio-tech", when: (s) => s.stats.extracts > 0, text: "Breaking! BananaGPT raises another round. Nobody knows what it does. Valuation: yes." },
  ],
  keeper: [],
};
export const greetLine = (id: NpcId, s: SaveV1) => GREET[id].find((l) => l.when(s))?.text ?? "";
/** the Radio Operator's lore drops when you ask for chatter (cycled) */
export const CHATTER = [
  "Mainland news: BananaGPT raised another round. Nobody knows what it does. Investors say that's the point.",
  "The Peel Gang thinks the foreman's ledger is a cookbook. It sort of is.",
  "Hired Guns charge by the day. The gangs pay by the banana. Somebody's losing that maths.",
  "A lookout keeps seeing green lights over the north jungle. He also keeps drinking.",
  "The Warden ordered forty robots. Thirty-nine are missing. One's in a barn.",
  "Grove Keepers trade by the mangrove water. Be polite. They were here first.",
  "The Rum Runners raid the beach when the tide's high and the rum's low.",
];
