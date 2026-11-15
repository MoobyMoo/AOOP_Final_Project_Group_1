// Character materials. The Blender-built meshes carry a colour REGION id and a baked AO value per vertex (in the
// glTF UV channel: u = (region + 0.5) / 48, v = ao). One MeshStandardMaterial per rig instance turns them into
// colour through a palette uniform, so a Look change is a uniform write (no geometry rebuild) and the hurt flash
// never touches a shared material. The game's rim-light patch() from render/shading is applied on top.
import * as THREE from "three";
import { patch } from "../render/shading";

/** must match tools/blender/bv_common.py REGIONS (index = region id) */
export const REGIONS = ["fur", "face", "suit", "pants", "tie", "feet", "shirt", "dark", "white", "pupil", "gold", "mouth",
  "tongue", "suit2", "stripeA", "stripeB", "sole", "prop", "prop2", "fur2", "skin", "metal", "red",
  "cloth", "chain", "mask", "hat", "band", "lens", "leather", "leather2", "banana", "green", "blue", "pink",
  "yellow", "khaki", "wood", "wood2", "glass", "skin2", "vest", "vest2", "nail", "ear", "square", "navy", "leaf"] as const;
export type Region = (typeof REGIONS)[number];
export const NREG = 48;
const BASE: Record<Region, string> = {
  fur: "#e07a32", face: "#f6c896", suit: "#4d4848", pants: "#3a3838", tie: "#f46a10", feet: "#c4612a",
  shirt: "#f6f2ea", dark: "#3a2420", white: "#ffffff", pupil: "#1c1416", gold: "#e8b84a", mouth: "#5a1f24",
  tongue: "#e8707a", suit2: "#403c3c", stripeA: "#f3eadb", stripeB: "#2f2a36", sole: "#2a2024", prop: "#a8875a",
  prop2: "#6e5334", fur2: "#b85e24", skin: "#4a4652", metal: "#c9ccd6", red: "#d9493a", cloth: "#3a3d4c",
  chain: "#e8c860", mask: "#7a4ea0", hat: "#343036", band: "#f46a10", lens: "#15131a", leather: "#8a5a34",
  leather2: "#6a4226", banana: "#ffd84a", green: "#5a9a4a", blue: "#3a6ad1", pink: "#ff6aa0", yellow: "#ffc93a",
  khaki: "#cdbd8c", wood: "#b98a52", wood2: "#8f6638", glass: "#bfe6f2", skin2: "#6a6674", vest: "#4a4458",
  vest2: "#d9d2c4", nail: "#2c2a33", ear: "#f0a468", square: "#f6f2ea", navy: "#2b4170", leaf: "#3c7a3a",
};
const RID = Object.fromEntries(REGIONS.map((r, i) => [r, i])) as Record<Region, number>;
const tmpC = new THREE.Color();

/** a fresh palette (linear RGB, NREG x 3) with the default colours */
export function newPalette(): Float32Array {
  const p = new Float32Array(NREG * 3);
  for (const r of REGIONS) setRegion(p, r, BASE[r]);
  return p;
}
export function setRegion(p: Float32Array, r: Region, color: THREE.ColorRepresentation) {
  tmpC.set(color); const i = RID[r] * 3; p[i] = tmpC.r; p[i + 1] = tmpC.g; p[i + 2] = tmpC.b;
}
/** shade of a colour: l < 0 darker, > 0 lighter; s scales saturation */
export function shade(color: THREE.ColorRepresentation, l: number, s = 1): THREE.Color {
  const c = new THREE.Color(color), h = { h: 0, s: 0, l: 0 }; c.getHSL(h);
  return c.setHSL(h.h, Math.min(1, h.s * s), Math.min(1, Math.max(0, h.l + l)));
}
export const regionDefault = (r: Region) => BASE[r];
/** the fixed palette used by wearables and props */
export const STATIC_PALETTE = newPalette();

/** MeshStandardMaterial that reads colour from the palette; patch() adds the game's rim light and light cookie */
export function charMaterial(pal: Float32Array, gloss = false): THREE.MeshStandardMaterial {
  const m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: gloss ? 0.22 : 0.62, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 }), { rim: 0.6 });
  const inner = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    inner.call(m, sh, r);
    sh.uniforms.uPal = { value: pal };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nattribute vec2 aRA;\nuniform vec3 uPal[${NREG}];`)
      .replace("#include <color_vertex>", "vColor = vec4(uPal[int(aRA.x + 0.5)] * mix(vec3(0.42, 0.34, 0.40), vec3(1.0), smoothstep(0.0, 1.0, aRA.y / 255.0)), 1.0);")
    // self-fill: fronts stay readable when the low sun is behind the character (the look target is backlit). The hurt flash
    // (emissiveIntensity) brightens the character's own colours plus a little white, so a dark brute pops instead of greying out
    sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance = vColor.rgb * (0.26 + totalEmissiveRadiance.r * 2.4) + totalEmissiveRadiance * 0.35;");
  };
  m.customProgramCacheKey = () => key + "|pal";
  return m;
}

/** region + ao bytes from the glTF UV channel (glTF flips v) */
export function regionBytes(uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Uint8Array {
  const n = uv.count, out = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = Math.min(NREG - 1, Math.floor(uv.getX(i) * NREG));
    out[i * 2 + 1] = Math.round(Math.min(1, Math.max(0, 1 - uv.getY(i))) * 255);
  }
  return out;
}
/** swap the UV channel of a loaded geometry for the packed region attribute the material reads */
export function prepGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.getAttribute("aRA") && g.getAttribute("uv")) {
    g.setAttribute("aRA", new THREE.BufferAttribute(regionBytes(g.getAttribute("uv")), 2, false));
    g.deleteAttribute("uv");
  }
  return g;
}
