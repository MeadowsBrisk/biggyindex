// extractLocationTokens.js
// Extract hidden form tokens used by /setLocationFilter & /item/share
function extractLocationTokens(html) {
  if (!html) return {};
  const out = {};
  try {
    const sp = html.match(/<input[^>]+name="_sourcePage"[^>]+value="([^"]+)"/i);
    if (sp) out._sourcePage = sp[1];
    const fp = html.match(/<input[^>]+name="__fp"[^>]+value="([^"]+)"/i);
    if (fp) out.__fp = fp[1];
  } catch {}
  return out;
}
module.exports = { extractLocationTokens };

