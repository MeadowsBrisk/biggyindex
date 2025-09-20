// descriptionExtractor.js - static (non-headless) description extraction
// Exports: extractDescription(html:string) -> { description, meta } | null

function extractDescription(html) {
  if (!html || typeof html !== 'string') return null;
  const lower = html.toLowerCase();
  let startIdx = -1;
  const descMatch = html.match(/<div[^>]*class="[^"]*item-description[^"]*"[^>]*>/i);
  if (descMatch) {
    startIdx = descMatch.index;
  } else {
    // Fallback: region between first <h1 and first shipping foldable
    const h1 = lower.indexOf('<h1');
    if (h1 !== -1) {
      startIdx = h1;
    }
  }
  if (startIdx === -1) return null;

  const slice = html.slice(startIdx, startIdx + 120000); // hard cap window
  // Find termination (shipping foldable or share form)
  let endRel = slice.length;
  const shipRelIdx = slice.search(/<div[^>]*class="[^"]*foldable[^"]*bp3[^"]*"/i);
  if (shipRelIdx !== -1) endRel = Math.min(endRel, shipRelIdx);
  const shareRelIdx = slice.search(/<form[^>]*class="[^"]*shareForm[^"]*"/i);
  if (shareRelIdx !== -1) endRel = Math.min(endRel, shareRelIdx);
  let region = slice.slice(0, endRel);

  // Extend to include immediate following Bp3 siblings prior to shipping marker (basic heuristic)
  // (Optional: could iterate but keep simple for now)

  // Remove forms / scripts / styles / buttons / inputs
  region = region
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<button[\s\S]*?<\/button>/gi, ' ')
    .replace(/<input[^>]*>/gi, ' ')
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, ' ')
    .replace(/<select[\s\S]*?<\/select>/gi, ' ');

  // Convert <br> & block tags to newlines
  region = region
    .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
    .replace(/<\/(div|p|li|ul|ol|section|article|tr|td|th|h[1-6])>/gi, '\n');

  // Strip remaining tags
  region = region.replace(/<[^>]+>/g, ' ');

  // Decode basic entities
  region = region
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Normalize whitespace
  region = region.replace(/[\t\r]+/g, ' ');
  region = region.replace(/\n{3,}/g, '\n\n');
  region = region.replace(/ +/g, ' ');
  region = region.split('\n').map(l => l.trim()).join('\n');
  region = region.replace(/\n{3,}/g, '\n\n').trim();

  // NEW: remove trailing shipping origin line (e.g., 'ships from united kingdom (...)') if present
  region = region.replace(/(?:\n|^)ships from [^\n]*$/i, '').trim();

  const collapsedDetected = /show more|expand/i.test(region) || /collapsed|expand/i.test(slice);
  const warnings = [];
  if (region.length > 100000) warnings.push('truncated');

  return {
    description: region,
    meta: {
      length: region.length,
      ...(warnings.length ? { warnings } : {})
    }
  };
}

module.exports = { extractDescription };
