// STUB (lead): replaced by Fable A's wearables. Catalog ids must match.
import * as THREE from "three";
import type { Wearable, Gear } from "../contracts";
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
export function buildWearable(id: string): THREE.Object3D { const g = new THREE.Group(); g.name = id; return g; }
