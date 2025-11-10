// Structured run-meta writer (stub)
import { getBlobClient } from "./blobs";

export interface RunMetaEntry {
  at: string; // ISO timestamp
  scope: string; // e.g., market code or 'global'
  counts?: Record<string, number>;
  error?: { message: string; code?: string };
  notes?: Record<string, unknown>;
}

export async function appendRunMeta(store: string, key: string, entry: Omit<RunMetaEntry, "at">) {
  const client = getBlobClient(store);
  const now = new Date().toISOString();
  const existing = (await client.getJSON<RunMetaEntry[]>(key)) || [];
  existing.push({ at: now, ...entry } as RunMetaEntry);
  await client.putJSON(key, existing);
}
