// Variant normalization & signature utilities extracted from index-items.js

function coerceNumber(value) {
  if (value == null) return null;
  const num = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function normalizeVariants(varieties) {
  const list = Array.isArray(varieties) ? varieties : [];
  const variants = list.map(v => {
    const baseCurrency = v?.basePrice?.currency || v?.basePrice?.code || v?.currency || 'USD';
    const baseAmount = v?.basePrice?.amount != null ? coerceNumber(v.basePrice.amount) : coerceNumber(v?.price);
    return { id: v?.id ?? null, description: v?.description ?? '', baseCurrency, baseAmount };
  }).filter(v => v.baseCurrency && v.baseAmount != null);
  const publicOut = variants.map(({ id, description, baseAmount }) => ({ id, description, baseAmount }));
  let priceMin = null, priceMax = null;
  for (const v of variants) {
    priceMin = priceMin == null ? v.baseAmount : Math.min(priceMin, v.baseAmount);
    priceMax = priceMax == null ? v.baseAmount : Math.max(priceMax, v.baseAmount);
  }
  return { variants, publicVariants: publicOut, priceMin, priceMax };
}

function buildSignature(item, variants) {
  const base = {
    name: item?.name ?? '',
    description: item?.description ?? '',
    sellerId: item?.seller?.id ?? null,
    sellerName: item?.seller?.name ?? '',
    images: Array.isArray(item?.images) ? item.images.length : 0,
  };
  const variantsSig = (variants || []).map(v => `${v.description}|${v.baseCurrency}|${v.baseAmount}`).join(';');
  return JSON.stringify({ ...base, variantsSig });
}

module.exports = { normalizeVariants, buildSignature };