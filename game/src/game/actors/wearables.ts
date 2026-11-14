// Wearables: rigid meshes built in Blender (tools/blender/build_wearables.py -> public/models/wearables.glb), one
// node per id, authored in socket space (head = top of the head, face = between the eyes, back = upper back,
// body = the chest joint, ears = the point between the two ears). Also holds the hand/back props the rigs use
// (briefcase, boomerang, loot sack, bandana).
// G1-23: gear is loot in five slots (our build of the mechanism in Duckov's CharacterEquipmentController). Stats live
// in loot/equipment.ts; this file only knows the mesh, slot, name, rarity and what a piece hides.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Wearable, Gear } from "../contracts";
import { charMaterial, prepGeometry, STATIC_PALETTE, type Region } from "./charmat";

export const WEARABLES: Wearable[] = [
  { id: "suit", slot: "body", name: "Businessman's Suit", rarity: "common" },
  { id: "pot_helmet", slot: "head", name: "Cooking Pot", rarity: "common" },
  { id: "coconut_helmet", slot: "head", name: "Coconut Helmet", rarity: "uncommon" },
  { id: "warden_helmet", slot: "head", name: "Warden's Riot Helmet", rarity: "epic" },
  { id: "snorkel", slot: "face", name: "Snorkel Mask", rarity: "common" },
  { id: "leaf_vest", slot: "body", name: "Banana-Leaf Vest", rarity: "common" },
  { id: "life_jacket", slot: "body", name: "Ferry Life Jacket", rarity: "uncommon" },
  { id: "peel_jacket", slot: "body", name: "Peel Gang Padded Jacket", rarity: "uncommon" },
  { id: "bamboo_plate", slot: "body", name: "Bamboo Plate Vest", rarity: "uncommon" },
  { id: "coconut_cuirass", slot: "body", name: "Coconut Cuirass", rarity: "rare" },
  { id: "warden_vest", slot: "body", name: "Warden's Kevlar", rarity: "epic" },
  { id: "sack", slot: "back", name: "Loot Sack", rarity: "common" },
  { id: "walkman", slot: "ears", name: "Walkman Headphones", rarity: "rare" },
  { id: "radio_headset", slot: "ears", name: "Radio Headset", rarity: "epic" },
  { id: "bowler", slot: "head", name: "Bowler Hat", rarity: "common" }, { id: "tophat", slot: "head", name: "Top Hat", rarity: "rare" },
  { id: "fedora", slot: "head", name: "Fedora", rarity: "uncommon" }, { id: "cap", slot: "head", name: "Cap", rarity: "common" },
  { id: "hardhat", slot: "head", name: "Hard Hat", rarity: "uncommon" }, { id: "pith", slot: "head", name: "Pith Helmet", rarity: "rare" },
  { id: "beanie", slot: "head", name: "Beanie", rarity: "common" }, { id: "crown", slot: "head", name: "Crown", rarity: "epic" },
  { id: "shades", slot: "face", name: "Shades", rarity: "common" }, { id: "aviators", slot: "face", name: "Aviators", rarity: "uncommon" },
  { id: "monocle", slot: "face", name: "Monocle", rarity: "rare" }, { id: "eyepatch", slot: "face", name: "Eyepatch", rarity: "uncommon" },
  { id: "goggles", slot: "face", name: "Ski Goggles", rarity: "uncommon" }, { id: "heartglasses", slot: "face", name: "Heart Glasses", rarity: "rare" },
  { id: "banditmask", slot: "face", name: "Bandit Mask", rarity: "uncommon", hidesBrows: true },
  { id: "satchel", slot: "back", name: "Satchel", rarity: "common" }, { id: "bigpack", slot: "back", name: "Big Backpack", rarity: "uncommon" }, { id: "cratepack", slot: "back", name: "Banana Crate Pack", rarity: "rare" },
  // ---- G1-23 loot gear
  { id: "pot_helmet", slot: "head", name: "Cooking Pot", rarity: "common" }, { id: "coconut_helmet", slot: "head", name: "Coconut Helmet", rarity: "uncommon" },
  { id: "warden_helmet", slot: "head", name: "Warden's Riot Helmet", rarity: "rare" },
  { id: "snorkel", slot: "face", name: "Snorkel Mask", rarity: "uncommon", hidesBrows: true },
  { id: "leaf_vest", slot: "body", name: "Banana-Leaf Vest", rarity: "common" }, { id: "life_jacket", slot: "body", name: "Ferry Life Jacket", rarity: "common", hidesTie: true },
  { id: "peel_jacket", slot: "body", name: "Peel Gang Padded Jacket", rarity: "uncommon" }, { id: "bamboo_plate", slot: "body", name: "Bamboo Plate Vest", rarity: "uncommon" },
  { id: "coconut_cuirass", slot: "body", name: "Coconut Cuirass", rarity: "rare" }, { id: "warden_vest", slot: "body", name: "Warden's Kevlar", rarity: "epic", hidesTie: true },
  { id: "sack", slot: "back", name: "Loot Sack", rarity: "common" },
  { id: "walkman", slot: "ears", name: "Walkman Headphones", rarity: "uncommon" }, { id: "radio_headset", slot: "ears", name: "Radio Headset", rarity: "rare" },
];
export const DEFAULT_GEAR: Gear = { head: "bowler", face: "shades", body: null, back: "satchel", ears: null }; // G1-23: body = the bound suit item once loot/equipment.ts lands
/** recolourable zones of each wearable: main + accent map to palette regions (creator: LookExt.gear[slot].main / .accent) */
export const WEAR_ZONES: Record<string, { main: Region; accent?: Region }> = {
  bowler: { main: "hat", accent: "band" }, tophat: { main: "hat", accent: "red" }, fedora: { main: "khaki", accent: "dark" }, cap: { main: "blue", accent: "banana" },
  hardhat: { main: "yellow" }, pith: { main: "khaki", accent: "leather" }, beanie: { main: "green", accent: "pink" }, crown: { main: "gold", accent: "red" },
  shades: { main: "hat", accent: "lens" }, aviators: { main: "gold", accent: "green" }, monocle: { main: "gold", accent: "glass" }, eyepatch: { main: "dark" },
  goggles: { main: "white", accent: "band" }, heartglasses: { main: "red", accent: "pink" }, banditmask: { main: "dark" },
  satchel: { main: "leather", accent: "leather2" }, bigpack: { main: "green", accent: "khaki" }, cratepack: { main: "wood", accent: "banana" },
  prop_bandana: { main: "red", accent: "white" }, prop_sack: { main: "prop", accent: "prop2" },
  pot_helmet: { main: "metal", accent: "hat" }, coconut_helmet: { main: "wood2", accent: "vest2" }, warden_helmet: { main: "navy", accent: "banana" },
  snorkel: { main: "blue", accent: "band" },
  leaf_vest: { main: "green", accent: "leaf" }, life_jacket: { main: "band", accent: "vest2" }, peel_jacket: { main: "yellow", accent: "prop2" },
  bamboo_plate: { main: "khaki", accent: "leather2" }, coconut_cuirass: { main: "wood2", accent: "prop" }, warden_vest: { main: "navy", accent: "banana" },
  sack: { main: "prop", accent: "prop2" }, walkman: { main: "band", accent: "metal" }, radio_headset: { main: "green", accent: "hat" },
};
/** equipment instances are "id" or "id#durability" (contracts.ts Gear); these read both forms */
export const baseId = (inst: string | null | undefined): string | null => (inst ? (inst.indexOf("#") < 0 ? inst : inst.slice(0, inst.indexOf("#"))) : null);
/** durability 0..100 of an instance (100 when it carries none) */
export const instDur = (inst: string | null | undefined): number => { const i = inst ? inst.indexOf("#") : -1, d = i < 0 ? 100 : Number(inst!.slice(i + 1)); return Number.isFinite(d) ? d : 100; };
export const wearable = (inst: string | null | undefined) => { const id = baseId(inst); return id ? WEARABLES.find((w) => w.id === id) : undefined; };

type Tmpl = { geo: THREE.BufferGeometry; gloss: boolean }[];
const TMPL = new Map<string, Tmpl>();
let loading: Promise<void> | null = null;
let matte: THREE.MeshStandardMaterial | null = null, gloss: THREE.MeshStandardMaterial | null = null;

/** load wearables.glb once (called by preloadCharacters in rig.ts) */
export function preloadWearables(url = `${import.meta.env.BASE_URL}models/wearables.glb`): Promise<void> {
  loading ??= new GLTFLoader().loadAsync(url).then((gltf) => {
    for (const node of gltf.scene.children) {
      const list: Tmpl = [];
      node.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const g = prepGeometry(m.geometry); g.computeBoundingSphere();
        list.push({ geo: g, gloss: /gloss/.test((m.material as THREE.Material).name) });
      });
      if (list.length) TMPL.set(node.name, list);
    }
  });
  return loading;
}
export const wearablesReady = () => TMPL.size > 0;
/** true when wearables.glb holds a mesh for this id (headsets also ship an "<id>_nb" neckband variant for under hats) */
export const hasWearable = (id: string) => TMPL.has(id);
/** the template geometries of a wearable (socket space); the monkey rig skins body armour from these */
export const wearableGeos = (id: string): THREE.BufferGeometry[] => (TMPL.get(id) ?? []).map((t) => t.geo);

/** triangles in a wearable/prop (budgets, review page) */
export function wearableTris(id: string) { return (TMPL.get(id) ?? []).reduce((a, t) => a + (t.geo.index ? t.geo.index.count : t.geo.getAttribute("position").count) / 3, 0); }

/** internal: a wearable/prop instance using the given materials (rigs pass per-instance ones for the hurt flash) */
export function instWearable(id: string, mats: { matte: THREE.Material; gloss: THREE.Material }): THREE.Group {
  const g = new THREE.Group(); g.name = id;
  for (const t of TMPL.get(id) ?? []) {
    const m = new THREE.Mesh(t.geo, t.gloss ? mats.gloss : mats.matte);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
  }
  return g;
}
/** a wearable mesh in socket space, for sockets, pickups and icons. Shares two materials across all callers. */
export function buildWearable(inst: string): THREE.Object3D {
  const id = baseId(inst) ?? inst;
  matte ??= charMaterial(STATIC_PALETTE, false); gloss ??= charMaterial(STATIC_PALETTE, true);
  return instWearable(id, { matte, gloss });
}
