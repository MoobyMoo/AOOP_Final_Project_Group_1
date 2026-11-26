export type Graphics = { quality: "low" | "medium" | "high" | "custom"; scale: number; shadows: boolean; post: boolean };
export const GRAPHICS_PRESETS: Record<"low" | "medium" | "high", Graphics> = {
  low: { quality: "low", scale: 0.5, shadows: false, post: false },
  medium: { quality: "medium", scale: 0.75, shadows: true, post: true },
  high: { quality: "high", scale: 1, shadows: true, post: true },
};
export function sanitizeGraphics(value: unknown): Graphics {
  const raw = value && typeof value === "object" ? value as Partial<Graphics> : {};
  const quality = raw.quality && ["low", "medium", "high", "custom"].includes(raw.quality) ? raw.quality : "medium";
  const base = quality === "custom" ? GRAPHICS_PRESETS.medium : GRAPHICS_PRESETS[quality];
  return { quality, scale: typeof raw.scale === "number" && Number.isFinite(raw.scale) ? Math.min(1.25, Math.max(0.5, raw.scale)) : base.scale, shadows: typeof raw.shadows === "boolean" ? raw.shadows : base.shadows, post: typeof raw.post === "boolean" ? raw.post : base.post };
}
export const graphics: Graphics = (() => { try { return sanitizeGraphics(JSON.parse(localStorage.getItem("bv_graphics_v1") ?? "null")); } catch { return sanitizeGraphics(null); } })();
export function saveGraphics() { try { localStorage.setItem("bv_graphics_v1", JSON.stringify(graphics)); return true; } catch { return false; } }
