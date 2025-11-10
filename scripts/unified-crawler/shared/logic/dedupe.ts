// Worklist builder & dedupe (Phase B minimal)
// Pure function: given market indexes and known existing core IDs, compute a deduped worklist.
export interface BuildWorklistInput {
  indexes: Array<{ market: string; items: Array<{ id: string }> }>;
  existingCoreIds?: Set<string>;
}
export interface WorkItem { id: string; markets: string[] }
export interface Worklist {
  uniqueIds: string[];
  toCrawl: WorkItem[];       // items missing from shared core
  alreadyHave: WorkItem[];   // items that already exist in shared core
}
export function buildItemsWorklist(input: BuildWorklistInput): Worklist {
  const existing = input.existingCoreIds || new Set<string>();
  const byId = new Map<string, Set<string>>();
  for (const m of input.indexes) {
    const market = String(m.market);
    const items = Array.isArray(m.items) ? m.items : [];
    for (const it of items) {
      const id = String((it as any)?.id ?? "").trim();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, new Set<string>());
      byId.get(id)!.add(market);
    }
  }
  const uniqueIds = Array.from(byId.keys());
  const toCrawl: WorkItem[] = [];
  const alreadyHave: WorkItem[] = [];
  for (const id of uniqueIds) {
    const markets = Array.from(byId.get(id) || []);
    const entry = { id, markets };
    if (existing.has(id)) alreadyHave.push(entry);
    else toCrawl.push(entry);
  }
  return { uniqueIds, toCrawl, alreadyHave };
}
