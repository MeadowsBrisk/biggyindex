function getImageUrl(images) {
  if (!images) return '';
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') return first.url || first.src || first.href || '';
  }
  return '';
}

function getImageUrls(images) {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images.map(img => {
      if (typeof img === 'string') return img;
      if (img && typeof img === 'object') return img.url || img.src || img.href || '';
      return '';
    }).filter(Boolean);
  }
  return [];
}

module.exports = { getImageUrl, getImageUrls };