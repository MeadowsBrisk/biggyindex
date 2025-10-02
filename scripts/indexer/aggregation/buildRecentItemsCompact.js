function buildRecentItemsCompact(processedItems, limit = 25) {
  const RECENT_LIMIT = Number.isFinite(limit) && limit > 0 ? limit : 25;
  function mapForRecent(it, label, ts) {
    return {
      id: it.id ?? it.refNum ?? null,
      refNum: it.refNum ?? null,
      name: it.name ?? '',
      sellerName: it.sellerName ?? '',
      sellerId: it.sellerId ?? null,
      category: it.category ?? null,
      createdAt: ts ?? it.firstSeenAt ?? it.lastUpdatedAt ?? null,
      metaLabel: label,
      url: it.share ?? it.url ?? null,
      imageUrl: it.imageUrl ?? null,
    };
  }
  const recentlyAdded = [...processedItems]
    .filter((it) => it && (it.firstSeenAt || it.lastUpdatedAt) && it.name)
    .sort((a, b) => (Date.parse(b.firstSeenAt || b.lastUpdatedAt || 0) || 0) - (Date.parse(a.firstSeenAt || a.lastUpdatedAt || 0) || 0))
    .slice(0, RECENT_LIMIT)
    .map((it) => mapForRecent(it, 'Added', it.firstSeenAt ?? it.lastUpdatedAt ?? null));
  const recentlyUpdated = [...processedItems]
    .filter((it) => it && it.lastUpdatedAt && it.name && (!it.firstSeenAt || it.lastUpdatedAt !== it.firstSeenAt))
    .sort((a, b) => (Date.parse(b.lastUpdatedAt || 0) || 0) - (Date.parse(a.lastUpdatedAt || 0) || 0))
    .slice(0, RECENT_LIMIT)
    .map((it) => mapForRecent(it, 'Updated', it.lastUpdatedAt ?? it.firstSeenAt ?? null));
  return { added: recentlyAdded, updated: recentlyUpdated };
}

module.exports = { buildRecentItemsCompact };
