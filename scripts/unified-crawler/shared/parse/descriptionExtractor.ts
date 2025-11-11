export interface DescriptionMeta { length: number; warnings?: string[] }
export interface DescriptionResult { description: string; meta: DescriptionMeta }

export function extractDescription(html: string): DescriptionResult | null {
  if (!html || typeof html !== 'string') return null;
  const lower = html.toLowerCase();
  let startIdx = -1;
  const descMatch = html.match(/<div[^>]*class="[^"]*item-description[^"]*"[^>]*>/i);
  if (descMatch) {
    startIdx = descMatch.index!;
  } else {
    const h1 = lower.indexOf('<h1');
    if (h1 !== -1) startIdx = h1;
  }
  if (startIdx === -1) return null;
  const slice = html.slice(startIdx, startIdx + 120000);
  let endRel = slice.length;
  const shipRelIdx = slice.search(/<div[^>]*class="[^"]*foldable[^"]*bp3[^"]*"/i);
  if (shipRelIdx !== -1) endRel = Math.min(endRel, shipRelIdx);
  const shareRelIdx = slice.search(/<form[^>]*class="[^"]*shareForm[^"]*"/i);
  if (shareRelIdx !== -1) endRel = Math.min(endRel, shareRelIdx);
  let region = slice.slice(0, endRel);
  region = region
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<button[\s\S]*?<\/button>/gi, ' ')
    .replace(/<input[^>]*>/gi, ' ')
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, ' ')
    .replace(/<select[\s\S]*?<\/select>/gi, ' ');
  region = region
    .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
    .replace(/<\/(div|p|li|ul|ol|section|article|tr|td|th|h[1-6])>/gi, '\n');
  region = region.replace(/<[^>]+>/g, ' ');
  region = region
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  region = region.replace(/[\t\r]+/g, ' ');
  region = region.replace(/\n{3,}/g, '\n\n');
  region = region.replace(/ +/g, ' ');
  region = region.split('\n').map(l => l.trim()).join('\n');
  region = region.replace(/\n{3,}/g, '\n\n').trim();
  region = region.replace(/(?:\n|^)ships from [^\n]*$/i, '').trim();
  // Remove "this item is not available in" error message (appears when wrong location filter)
  region = region.replace(/this item is not available in\s*/gi, '').trim();
  const warnings: string[] = [];
  if (region.length > 100000) warnings.push('truncated');
  return { description: region, meta: { length: region.length, ...(warnings.length ? { warnings } : {}) } };
}