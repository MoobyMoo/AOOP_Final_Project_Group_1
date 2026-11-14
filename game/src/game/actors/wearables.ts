// Wearables: rigid meshes built in Blender (tools/blender/build_wearables.py -> public/models/wearables.glb), one
// node per id, authored in socket space (head = top of the head, face = between the eyes, back = upper back).
// Also holds the hand/back props the rigs use (briefcase, boomerang, loot sack, bandana).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Wearable, Gear } from "../contracts";
import { charMaterial, prepGeometry, STATIC_PALETTE, type Region } from "./charmat";

export const WEARABLES: Wearable[] = [
  { id: "bowler", slot: "head", name: "Bowler Hat", rarity: "common" }, { id: "tophat", slot: "head", name: "Top Hat", rarity: "rare" },
  { id: "fedora", slot: "head", name: "Fedora", rarity: "uncommon" }, { id: "cap", slot: "head", name: "Cap", rarity: "common" },
  { id: "hardhat", slot: "head", name: "Hard Hat", rarity: "uncommon" }, { id: "pith", slot: "head", name: "Pith Helmet", rarity: "rare" },
  { id: "beanie", slot: "head", name: "Beanie", rarity: "common" }, { id: "crown", slot: "head", name: "Crown", rarity: "epic" },
  { id: "shades", slot: "face", name: "Shades", rarity: "common" }, { id: "aviators", slot: "face", name: "Aviators", rarity: "uncommon" },
  { id: "monocle", slot: "face", name: "Monocle", rarity: "rare" }, { id: "eyepatch", slot: "face", name: "Eyepatch", rarity: "uncommon" },
  { id: "goggles", slot: "face", name: "Ski Goggles", rarity: "uncommon" }, { id: "heartglasses", slot: "face", name: "Heart Glasses", rarity: "rare" },
  { id: "banditmask", slot: "face", name: "Bandit Mask", rarity: "uncommon", hidesBrows: true },
  { id: "satchel", slot: "back", name: "Satchel", rarity: "common" }, { id: "bigpack", slot: "back", name: "Big Backpack", rarity: "uncommon" }, { id: "cratepack", slot: "back", name: "Banana Crate Pack", rarity: "rare" },
];
export const DEFAULT_GEAR: Gear = { head: "bowler", face: "shades", back: "satchel" };
/** recolourable zones of each wearable: main + accent map to palette regions (creator: LookExt.gear[slot].main / .accent) */
export const WEAR_ZONES: Record<string, { main: Region; accent?: Region }> = {
  bowler: { main: "hat", accent: "band" }, tophat: { main: "hat", accent: "red" }, fedora: { main: "khaki", accent: "dark" }, cap: { main: "blue", accent: "banana" },
  hardhat: { main: "yellow" }, pith: { main: "khaki", accent: "leather" }, beanie: { main: "green", accent: "pink" }, crown: { main: "gold", accent: "red" },
  shades: { main: "hat", accent: "lens" }, aviators: { main: "gold", accent: "green" }, monocle: { main: "gold", accent: "glass" }, eyepatch: { main: "dark" },
  goggles: { main: "white", accent: "band" }, heartglasses: { main: "red", accent: "pink" }, banditmask: { main: "dark" },
  satchel: { main: "leather", accent: "leather2" }, bigpack: { main: "green", accent: "khaki" }, cratepack: { main: "wood", accent: "banana" },
  prop_bandana: { main: "red", accent: "white" }, prop_sack: { main: "prop", accent: "prop2" },
};
export const wearable = (id: string | null) => WEARABLES.find((w) => w.id === id);

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
export function buildWearable(id: string): THREE.Object3D {
  matte ??= charMaterial(STATIC_PALETTE, false); gloss ??= charMaterial(STATIC_PALETTE, true);
  return instWearable(id, { matte, gloss });
}
