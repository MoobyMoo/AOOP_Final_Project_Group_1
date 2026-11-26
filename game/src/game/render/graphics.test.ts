import { sanitizeGraphics, GRAPHICS_PRESETS } from "./graphics";
let checks = 0;
function assert(ok: unknown, message: string) { checks++; if (!ok) throw new Error(message); }
assert(sanitizeGraphics(null).quality === "medium", "safe default");
assert(sanitizeGraphics({ quality: "low" }).shadows === false, "low preset disables shadows");
assert(sanitizeGraphics({ quality: "low" }).post === false, "low preset disables effects");
assert(sanitizeGraphics({ quality: "high" }).scale === 1, "high resolution preset");
assert(sanitizeGraphics({ scale: 100 }).scale === 1.25, "resolution capped");
assert(sanitizeGraphics({ scale: -1 }).scale === .5, "resolution minimum");
assert(sanitizeGraphics({ scale: NaN }).scale === .75, "invalid number rejected");
assert(sanitizeGraphics({ quality: "invalid" }).quality === "medium", "invalid preset rejected");
assert(GRAPHICS_PRESETS.low.scale < GRAPHICS_PRESETS.high.scale, "low reduces render resolution");
console.log(`Graphics: ${checks} checks passed`);
