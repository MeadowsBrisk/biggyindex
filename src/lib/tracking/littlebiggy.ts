export function normalizeLittleBiggyUrl(url: string): string {
  return url.replace(/littlebiggy\.net/g, "littlebiggy.org");
}

export interface LittleBiggyItemLinkInput {
  sl?: string | null;
  refNum?: string | number | null;
  id?: string | number | null;
}

export function getLittleBiggyItemUrl(
  item: LittleBiggyItemLinkInput,
): string | null {
  if (item.sl) return normalizeLittleBiggyUrl(item.sl);
  const ref = item.refNum ?? item.id;
  if (ref == null || ref === "") return null;
  return `https://littlebiggy.org/item/${encodeURIComponent(String(ref))}/view/p`;
}

export function extractLittleBiggyId(url: string): string {
  const itemMatch = url.match(/\/item\/([^/?#]+)/);
  if (itemMatch?.[1]) return itemMatch[1];

  const sellerMatch = url.match(/\/seller\/([^/?#]+)/);
  if (sellerMatch?.[1]) return sellerMatch[1];

  const linkMatch = url.match(/\/link\/([^/?#]+)/);
  if (linkMatch?.[1]) return `link:${linkMatch[1]}`;

  return "unknown";
}
