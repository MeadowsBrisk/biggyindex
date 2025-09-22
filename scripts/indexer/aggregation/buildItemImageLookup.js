function buildItemImageLookup(processedItems) {
  // Build maps for all items to ensure reviews can always resolve thumbnails.
  // Keep only the first image (imageUrl) per item.
  const byRef = {};
  const byId = {};
  for (const it of processedItems) {
    if (!it || !it.imageUrl) continue;
    if (it.refNum != null) {
      const key = String(it.refNum);
      if (!byRef[key]) byRef[key] = it.imageUrl;
    }
    if (it.id != null) {
      const key = String(it.id);
      if (!byId[key]) byId[key] = it.imageUrl;
    }
  }
  return { byRef, byId };
}

module.exports = { buildItemImageLookup };
