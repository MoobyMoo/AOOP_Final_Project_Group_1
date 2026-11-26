export type PickupNotice = { kind: "pickup" | "blocked"; type: string; item: string; count: number; detail: string; expires: number };
/** A short, bounded feed. Repeated pickups merge only while their earlier notice is visible. */
export function createPickupNotices(limit = 3, lifetime = 4.5) {
  let notices: PickupNotice[] = [];
  const entries = (now: number) => { notices = notices.filter(n => n.expires > now); return notices; };
  return {
    entries,
    clear() { notices = []; },
    add(kind: PickupNotice["kind"], type: string, item: string, count: number, detail: string, now: number) {
      if (!Number.isSafeInteger(count) || count < 1) return;
      entries(now);
      const previous = notices.find(n => n.kind === kind && n.type === type);
      notices = notices.filter(n => n !== previous && !(kind === "pickup" && n.kind === "blocked" && n.type === type));
      notices.push({ kind, type, item, count: kind === "pickup" ? (previous?.count ?? 0) + count : count, detail, expires: now + lifetime });
      notices = notices.slice(-limit);
    },
  };
}
