export interface ShippingOption { label: string; cost: number }
export interface ShippingExtractResult { options: ShippingOption[]; raw: string; warnings: string[] }

function decodeHtml(str: string) {
  if (!str) return '';
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function extractShippingHtml(html: string): ShippingExtractResult {
  const warnings: string[] = [];
  if (!html || typeof html !== 'string') return { options: [], raw: '', warnings: ['no_html'] };
  const options: ShippingOption[] = [];
  const seen = new Set<string>();
  const rawSnippets: string[] = [];
  
  // Find all shipping option divs with class containing both "foldable" and "Bp3"
  // These contain price + label + optional country details
  // We use a simpler approach: find start tags, then extract content until balanced closing
  const blocks: string[] = [];
  const startRe = /<div[^>]*class="[^"]*(?:foldable[^"]*Bp3|Bp3[^"]*foldable)[^"]*"[^>]*>/gi;
  let startMatch: RegExpExecArray | null;
  while ((startMatch = startRe.exec(html))) {
    const startIdx = startMatch.index;
    // Find the balanced closing </div> by counting nested divs
    let depth = 1;
    let pos = startIdx + startMatch[0].length;
    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf('<div', pos);
      const nextClose = html.indexOf('</div>', pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 4;
      } else {
        depth--;
        if (depth === 0) {
          blocks.push(html.slice(startIdx, nextClose + 6));
        }
        pos = nextClose + 6;
      }
    }
  }
  
  for (const block of blocks) {
    const blockInner = block;
    const isShippingBlock = /class="[^"]*price[^"]*"/i.test(blockInner);
    if (!isShippingBlock) continue;
    let cost: number | null = null; let priceToken: string | null = null;
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
    if (priceToken == null) {
      const genericPrice = blockInner.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (genericPrice) {
        const txt = genericPrice[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
        if (txt === 'free') { cost = 0; priceToken = genericPrice[0]; }
        else if (/^[0-9]+(?:\.[0-9]{1,2})?$/.test(txt)) { cost = parseFloat(txt); priceToken = genericPrice[0]; }
      }
    }
    if (!Number.isFinite(cost) || !priceToken) continue;
    const afterIdx = blockInner.indexOf(priceToken) + priceToken.length;
    const tail = blockInner.slice(afterIdx);
    const spanRe = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    let label: string | null = null; let sm: RegExpExecArray | null;
    while ((sm = spanRe.exec(tail))) {
      const rawText = sm[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
      if (!rawText) continue;
      const txt = rawText.replace(/\s+/g, ' ');
      const low = txt.toLowerCase();
      if (/^(country|to|\d+)$/.test(low)) continue;
      if (/\$\d/.test(txt)) continue;
      label = decodeHtml(txt);
      break;
    }
    if (!label) { warnings.push('label_missing'); continue; }
    const key = label.toLowerCase() + '|' + cost;
    if (seen.has(key)) { warnings.push('duplicate_option'); continue; }
    seen.add(key);
    options.push({ label, cost: cost! });
    rawSnippets.push(blockInner.slice(0, 400));
    if (cost! > 0 && /class="[^"]*price[^"]*"[^>]*>\s*free\s*<\/span>/i.test(blockInner) && !options.some(o => o.cost === 0)) {
      options.push({ label: 'Free Shipping', cost: 0 });
    }
  }
  if (!options.length) warnings.push('no_shipping_blocks');
  return { options, raw: rawSnippets.join('\n'), warnings };
}