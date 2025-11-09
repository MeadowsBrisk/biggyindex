export interface ManifestoResult { manifesto: string | null; manifestoMeta: { length: number; lines: number }; }

export function extractManifesto(html: string): ManifestoResult {
  if (!html || typeof html !== 'string') return { manifesto: null, manifestoMeta: { length: 0, lines: 0 } };
  try {
    const openContainer = /<div[^>]*class=["'][^"']*reginald[^"']*Bp3[^"']*["'][^>]*>/i;
    const mOpen = openContainer.exec(html);
    if (!mOpen) return { manifesto: null, manifestoMeta: { length: 0, lines: 0 } };
    const startIdx = mOpen.index + mOpen[0].length;
    const tagRe = /<\/?div\b[^>]*>/gi;
    let depth = 1;
    let endIdx = -1;
    tagRe.lastIndex = startIdx;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(html))) {
      const tag = t[0];
      if (/^<div\b/i.test(tag)) depth++;
      else if (/^<\/div/i.test(tag)) depth--;
      if (depth === 0) { endIdx = t.index; break; }
    }
    if (endIdx < 0) return { manifesto: null, manifestoMeta: { length: 0, lines: 0 } };
    let regionHtml = html.slice(startIdx, endIdx);
    const labelOpenRe = /<div[^>]*class=["'][^"']*Bp0[^"']*gone[^"']*["'][^>]*>\s*manifesto\s*/i;
    const mLabel = labelOpenRe.exec(regionHtml);
    if (mLabel) {
      const lStart = mLabel.index;
      const lAfterOpen = mLabel.index + mLabel[0].length;
      const innerRe = /<\/?div\b[^>]*>/gi;
      let d = 1; innerRe.lastIndex = lAfterOpen; let te: RegExpExecArray | null; let lEndIdx = -1;
      while ((te = innerRe.exec(regionHtml))) {
        const tg = te[0];
        if (/^<div\b/i.test(tg)) d++;
        else if (/^<\/div/i.test(tg)) d--;
        if (d === 0) { lEndIdx = innerRe.lastIndex; break; }
      }
      if (lEndIdx > 0) {
        regionHtml = regionHtml.slice(0, lStart) + regionHtml.slice(lEndIdx);
      } else {
        regionHtml = regionHtml.slice(0, lStart) + regionHtml.slice(lAfterOpen);
      }
    }
    let region = regionHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
    region = region.replace(/<style[\s\S]*?<\/style>/gi, '');
    region = region.replace(/<form[\s\S]*?<\/form>/gi, '');
    region = region.replace(/<input[^>]*>/gi, '');
    region = region.replace(/<button[\s\S]*?<\/button>/gi, '');
    region = region.replace(/<br\s*\/?>(?=\s|$)/gi, '\n');
    region = region.replace(/<[^>]+>/g, '');
    let text = region.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 50 * 1024) {
      text = text.slice(0, 50 * 1024);
      const lastNl = text.lastIndexOf('\n');
      if (lastNl > 0) text = text.slice(0, lastNl);
    }
    const lines = text ? text.split(/\n/).length : 0;
    return { manifesto: text || null, manifestoMeta: { length: text.length || 0, lines } };
  } catch {
    return { manifesto: null, manifestoMeta: { length: 0, lines: 0 } };
  }
}
