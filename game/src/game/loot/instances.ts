export const instanceId = (inst: string): string | null => /@([a-zA-Z0-9_-]+)$/.exec(inst)?.[1] ?? null;
export const instanceBody = (inst: string): string => inst.replace(/@[a-zA-Z0-9_-]+$/, "");
export const itemType = (inst: string): string => instanceBody(inst).split(/[#~]/)[0];
export const stackCount = (inst: string, fallback: number): number => Number(/~([1-9][0-9]*)$/.exec(instanceBody(inst))?.[1] ?? fallback);
export function withCount(inst: string, count: number): string {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid stack count");
  return withIdentity(`${instanceBody(inst).replace(/~[0-9]+$/, "")}~${count}`, inst);
}
export function own(inst: string): string {
  return instanceId(inst) ? inst : `${inst}@${globalThis.crypto.randomUUID()}`;
}
export function withIdentity(body: string, original: string): string {
  const identity = instanceId(original);
  return identity ? `${body}@${identity}` : body;
}
