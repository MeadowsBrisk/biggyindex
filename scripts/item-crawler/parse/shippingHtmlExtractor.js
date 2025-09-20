// Extract shipping options (USD cost + label) from full item HTML.
// Strategy: find <div> blocks whose class contains both 'foldable' and 'Bp3' AND contains a 'foldable-trigger' span referencing 'country'.
// Within each block, locate first price (USD) and first following candidate label span.
// Output: { options:[{label,cost}], raw, warnings }

function decodeHtml(str){
  if(!str) return '';
  return str
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'");
}

function extractShippingHtml(html) {
  const warnings = [];
  if (!html || typeof html !== 'string') return { options: [], raw: '', warnings: ['no_html'] };

  const options = []; const seen = new Set(); const rawSnippets = [];
  // Greedy but bounded foldable block capture (up to 1800 chars to avoid runaway) – accept any foldable Bp3 block
  const foldableRe = /<div[^>]*class="[^"]*foldable[^"]*Bp3[^"]*"[^>]*>([\s\S]{0,1800}?)(?:<\/div>)/gi;
  let m;
  while((m = foldableRe.exec(html))) {
    const blockInner = m[1] || '';
  // Quick heuristic: must have either a price span (numeric or with currency symbol) OR the literal 'free' in a price span
  const isShippingBlock = /class="[^"]*price[^"]*"/i.test(blockInner);
  if (!isShippingBlock) continue;
    // price (supports numeric & 'free')
    let cost = null; let priceToken = null;
    // Try explicit FREE first (common failure previously)
    const freeSpan = blockInner.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>\s*free\s*<\/span>/i);
    if (freeSpan) { cost = 0; priceToken = freeSpan[0]; }
    if (priceToken == null) {
      const priceMatch = blockInner.match(/<span[^>]*class="[^"]*price[^"]*(?:USD)?[^"]*"[^>]*>[\s\S]*?(?:<span[^>]*currencySymbol[^>]*>\$<\/span>)?\s*([$]?)([0-9]+(?:\.[0-9]{1,2})?)/i);
      if (priceMatch) { cost = parseFloat(priceMatch[2] || priceMatch[1]); priceToken = priceMatch[0]; }
    }
    if (priceToken == null) {
      const dollarMatch = blockInner.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
      if (dollarMatch) { cost = parseFloat(dollarMatch[1]); priceToken = dollarMatch[0]; }
    }
    // Final fallback: any price span with inline number OR free word
    if (priceToken == null) {
      const genericPrice = blockInner.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (genericPrice) {
        const txt = genericPrice[1].replace(/<[^>]+>/g,'').trim().toLowerCase();
        if (txt === 'free') { cost = 0; priceToken = genericPrice[0]; }
        else if (/^[0-9]+(?:\.[0-9]{1,2})?$/.test(txt)) { cost = parseFloat(txt); priceToken = genericPrice[0]; }
      }
    }
    if(!Number.isFinite(cost) || !priceToken) continue;
    // label candidate: after price span, find next <span> textual
    const afterIdx = blockInner.indexOf(priceToken) + priceToken.length;
    const tail = blockInner.slice(afterIdx);
    const spanRe = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    let label = null; let sm;
    while((sm = spanRe.exec(tail))) {
      const rawText = sm[1].replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').trim();
      if(!rawText) continue;
      const txt = rawText.replace(/\s+/g,' ');
      if(/^(country|to|\d+)$/.test(txt.toLowerCase())) continue;
      if(/\$\d/.test(txt)) continue;
      label = decodeHtml(txt);
      break;
    }
    if(!label) { warnings.push('label_missing'); continue; }
    const key = label.toLowerCase()+'|'+cost;
    if(seen.has(key)) { warnings.push('duplicate_option'); continue; }
    seen.add(key);
    options.push({ label, cost });
    rawSnippets.push(blockInner.slice(0, 400));
    // If we captured a paid option but there's a preceding explicit free span we missed (e.g., structural variance), add it.
    if (cost > 0 && /class="[^"]*price[^"]*"[^>]*>\s*free\s*<\/span>/i.test(blockInner) && !options.some(o=>o.cost===0)) {
      options.push({ label: 'Free Shipping', cost: 0 });
    }
  }
  if (!options.length) warnings.push('no_shipping_blocks');
  return { options, raw: rawSnippets.join('\n'), warnings };
}

module.exports = { extractShippingHtml };
