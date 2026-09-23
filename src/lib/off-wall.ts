export type OffWallKind = "u" | "f";

export const OFF_WALL_KINDS: readonly OffWallKind[] = ["u", "f"];

interface OffWallStamp {
  ow?: 1 | 2 | null;
  owr?: string | null;
}

const KNOWN_REASONS = new Set(["fraud"]);

export function offWallKind(
  entry: OffWallStamp | null | undefined,
): OffWallKind | null {
  if (entry?.ow === 2) return "f";
  if (entry?.ow === 1) return "u";
  return null;
}

export function isOffWall(entry: OffWallStamp | null | undefined): boolean {
  return offWallKind(entry) !== null;
}

export function isOffWallShown(
  entry: OffWallStamp | null | undefined,
  shown: readonly OffWallKind[],
): boolean {
  const kind = offWallKind(entry);
  return kind === null || shown.includes(kind);
}

export function withoutOffWall<T extends OffWallStamp>(entries: T[]): T[] {
  return entries.filter((entry) => !isOffWall(entry));
}

export function toOffWallKinds(
  values: readonly string[] | null | undefined,
): OffWallKind[] {
  return OFF_WALL_KINDS.filter((kind) => values?.includes(kind));
}

export function offWallReasonKey(
  owr: string | null | undefined,
): string | null {
  return owr && KNOWN_REASONS.has(owr) ? owr : null;
}

export function sellerBrowseHref(
  sellerId: string,
  entry?: OffWallStamp | null,
): string {
  const kind = offWallKind(entry);
  const base = `/browse?sellers=${encodeURIComponent(sellerId)}`;
  return kind ? `${base}&ow=${kind}` : base;
}
