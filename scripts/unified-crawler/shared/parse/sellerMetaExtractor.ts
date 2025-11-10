export function extractSellerImageUrl(html: string): string | null {
  if (!html) return null;
  let m = html.match(/<img(?=[^>]*class=['"][^'"]*softened[^'"]["'][^>]*)([^>]*)>/i);
  const attrs = m && m[1] ? m[1] : null;
  const pickSrcFromAttrs = (a: string | null) => {
    if (!a) return null;
    const getAttr = (name: string) => {
      const re = new RegExp(name + "=['\"]([^'\"]+)['\"]", 'i');
      const mm = a.match(re);
      return mm && mm[1] ? mm[1] : null;
    };
    let src = getAttr('data-src') || null;
    if (!src) {
      const srcset = getAttr('srcset');
      if (srcset) {
        const first = String(srcset).split(',')[0].trim().split(' ')[0];
        if (first) src = first;
      }
    }
    if (!src) src = getAttr('src');
    if (src && /spinner-bert\.gif/i.test(src)) {
      const dataSrc = getAttr('data-src');
      if (dataSrc && !/spinner-bert\.gif/i.test(dataSrc)) src = dataSrc;
    }
    if (src && /spinner-bert\.gif/i.test(src)) src = null;
    return src;
  };
  let src = pickSrcFromAttrs(attrs);
  if (src && /\/images\/u\//i.test(src)) return src;
  // Broad scan across all images
  try {
    const imgTagRe = /<img\b([^>]*)>/gi;
    let mt: RegExpExecArray | null;
    while ((mt = imgTagRe.exec(html))) {
      const at = mt[1] || '';
      const cls = (at.match(/class=['\"]([^'\"]+)['\"]/i) || [,''])[1];
      const candidate = (at.match(/data-src=['\"]([^'\"]+)['\"]/i) || [,''])[1]
        || (function(){const s=(at.match(/srcset=['\"]([^'\"]+)['\"]/i)||[,null])[1]; if(!s) return null; const first=String(s).split(',')[0].trim().split(' ')[0]; return first||null;})()
        || (at.match(/src=['\"]([^'\"]+)['\"]/i) || [,''])[1];
      if (!candidate) continue;
      if (/spinner-bert\.gif/i.test(candidate)) continue;
      if (/\/images\/u\//i.test(candidate) || /softened/i.test(cls)) return candidate;
    }
  } catch {}
  return src;
}

function balancedContainerContent(html: string, classA: string, classB: string): string | null {
  const re = new RegExp('<div[^>]*class=["\'](?=[^"\']*' + classA + ')(?=[^"\']*' + classB + ')[^"\']*["\'][^>]*>', 'i');
  const open = re.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1; let t: RegExpExecArray | null; let end = -1;
  while ((t = tagRe.exec(html))) {
    const tag = (t as RegExpExecArray)[0];
    if (/^<div\b/i.test(tag)) depth++;
    else if (/^<\/div/i.test(tag)) depth--;
    if (depth === 0) { end = t.index; break; }
  }
  if (end < 0) return null;
  return html.slice(start, end);
}

export function extractOnlineAndJoined(html: string): { online: string | null; joined: string | null } {
  const regionHtml = balancedContainerContent(html, 'reginald', 'Bp1');
  if (!regionHtml) return { online: null, joined: null };
  let text = regionHtml.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>(?=\s|$)/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let online: string | null = null;
  const mo = text.match(/\bonline\s+([a-z]+)/i);
  if (mo) online = mo[1].toLowerCase();
  let joined: string | null = null;
  const mj = text.match(/\bjoined\s+([^\n]+)$/i) || text.match(/\bjoined\s+([^<]+?)(?:\s|$)/i);
  if (mj) joined = mj[1].trim();
  return { online, joined };
}
