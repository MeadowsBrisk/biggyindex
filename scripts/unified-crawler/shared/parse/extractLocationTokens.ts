export interface LocationTokens { _sourcePage?: string; __fp?: string }

export function extractLocationTokens(html: string): LocationTokens {
  if (!html) return {};
  const out: LocationTokens = {};
  try {
    const sp = html.match(/<input[^>]+name="_sourcePage"[^>]+value="([^"]+)"/i);
    if (sp) out._sourcePage = sp[1];
    const fp = html.match(/<input[^>]+name="__fp"[^>]+value="([^"]+)"/i);
    if (fp) out.__fp = fp[1];
  } catch {}
  return out;
}