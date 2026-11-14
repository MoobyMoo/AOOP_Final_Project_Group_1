// Shared helpers for KitPiece builders (both kit workers use these; only the lead edits this file).
// A KitPiece is geometry with baked vertex colours, so the world can merge everything in a 16 u chunk into one
// mesh per material (draw-call budget <= 700 per frame; the L1 scene used ~2,200).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { patch } from "../render/shading";
import type { KitPiece, MatId } from "../contracts";

const tmpC = new THREE.Color();
/** bake one colour (or a per-vertex function) into a non-indexed copy of geo, transformed by m */
export function bake(geo: THREE.BufferGeometry, color: string | ((x: number, y: number, z: number, out: THREE.Color) => void), m?: THREE.Matrix4, flat = false): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  if (m) g.applyMatrix4(m);
  if (flat || !g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { if (typeof color === "string") tmpC.set(color); else color(p.getX(i), p.getY(i), p.getZ(i), tmpC); col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
/** matrix helper: position, euler (x,y,z), scale */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
/** merge several baked geometries into one piece */
export function piece(geos: THREE.BufferGeometry[], mat: MatId, o: Partial<Omit<KitPiece, "geo" | "mat">> = {}): KitPiece {
  const geo = mergeGeometries(geos, false)!; geo.computeBoundingSphere();
  return { geo, mat, footprint: o.footprint ?? geo.boundingSphere!.radius * 0.6, blocksMove: o.blocksMove ?? false, blocksShot: o.blocksShot ?? false, tall: o.tall ?? false };
}
/** move/rotate a whole piece (returns a new piece) */
export function place(p: KitPiece, m: THREE.Matrix4): KitPiece { return { ...p, geo: p.geo.clone().applyMatrix4(m) }; }

let MATS: Record<MatId, THREE.Material> | null = null;
/** one shared material per MatId (vertex colours; rim + canopy cookie from shading.ts) */
export function kitMaterial(id: MatId): THREE.Material {
  MATS ??= {
    matte: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), { rim: 0.35 }),
    foliage: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }), { rim: 0.55 }),
    emissive: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return MATS[id];
}
/** merge many pieces (already placed in world space) into one mesh per material */
export function mergePieces(pieces: KitPiece[], shadows = true): THREE.Group {
  const g = new THREE.Group(), by = new Map<MatId, THREE.BufferGeometry[]>();
  for (const p of pieces) { const l = by.get(p.mat) ?? []; l.push(p.geo); by.set(p.mat, l); }
  for (const [id, geos] of by) {
    const m = new THREE.Mesh(mergeGeometries(geos, false)!, kitMaterial(id));
    m.castShadow = shadows && id !== "emissive"; m.receiveShadow = id !== "emissive"; g.add(m);
  }
  return g;
}
