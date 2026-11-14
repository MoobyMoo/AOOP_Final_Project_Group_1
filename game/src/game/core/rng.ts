// Shared deterministic rng (layouts must be the same every load) and tiny vector helpers.
import * as THREE from "three";
let seed = 7;
export const setSeed = (s: number) => { seed = s; };
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const rr = (a: number, b: number) => a + rnd() * (b - a);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
