const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); return true; } catch { return false; }
}

function buildAndWriteManifest({ processedItems, OUTPUT_DIR }) {
  const publicDataDir = path.join(OUTPUT_DIR, 'data');
  ensureDir(OUTPUT_DIR);
  ensureDir(publicDataDir);
  const byCategory = new Map();
  const subCounts = {};
  let globalMin = null, globalMax = null;
  for (const it of processedItems) {
    if (it.priceMin != null) globalMin = globalMin == null ? it.priceMin : Math.min(globalMin, it.priceMin);
    if (it.priceMax != null) globalMax = globalMax == null ? it.priceMax : Math.max(globalMax, it.priceMax);
    const cat = it.category;
    if (!cat) continue;
    const arr = byCategory.get(cat) || [];
    arr.push(it);
    byCategory.set(cat, arr);
    if (Array.isArray(it.subcategories)) {
      for (const s of it.subcategories) {
        subCounts[cat] = subCounts[cat] || {};
        subCounts[cat][s] = (subCounts[cat][s] || 0) + 1;
      }
    }
  }
  const manifest = { totalItems: processedItems.length, minPrice: globalMin, maxPrice: globalMax, categories: {} };
  for (const [cat, arr] of byCategory.entries()) {
    const fileName = `items-${cat.toLowerCase()}.json`;
    fs.writeFileSync(path.join(publicDataDir, fileName), JSON.stringify(arr, null, 2), 'utf8');
    manifest.categories[cat] = { count: arr.length, file: `/data/${fileName}`, subcategories: subCounts[cat] || {} };
  }
  try { fs.writeFileSync(path.join(publicDataDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8'); } catch (e) { console.warn('Could not write manifest.json:', e.message); }
  return { manifest, byCategory };
}

module.exports = { buildAndWriteManifest };