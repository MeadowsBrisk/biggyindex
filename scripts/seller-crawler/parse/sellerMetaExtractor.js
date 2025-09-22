// Extracts seller image URL and online/joined info from seller HTML

function extractSellerImageUrl(html) {
  if (!html) return null;
  // Prefer <img class~="softened"> and capture full attribute string
  let m = html.match(/<img(?=[^>]*class=['\"][^'\"]*softened[^'\"]["'][^>]*)([^>]*)>/i);
  let attrs = m && m[1] ? m[1] : null;
  if (!attrs) return null;
  // Extract candidates: data-src, srcset (first URL), then src
  const getAttr = (name) => {
    const re = new RegExp(name + "=['\"]([^'\"]+)['\"]", 'i');
    const mm = attrs.match(re);
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
  // If we couldn't extract a src from this tag, try a broader scan below
  if (!src) {
    // continue to broad scan
  } else {
    // Avoid spinner placeholder; prefer real user image under /images/u/
    if (/spinner-bert\.gif/i.test(src)) {
      const dataSrc = getAttr('data-src');
      if (dataSrc && !/spinner-bert\.gif/i.test(dataSrc)) src = dataSrc;
    }
    if (/spinner-bert\.gif/i.test(src)) src = null;
    if (src && /\/images\/u\//i.test(src)) return src;
  }
  // If not resolved yet, try a broader scan across all imgs
  // Broad scan: iterate all <img> tags and pick first with class softened and /images/u/
  try {
    const imgTagRe = /<img\b([^>]*)>/gi;
    let mt;
    while ((mt = imgTagRe.exec(html))) {
      const at = mt[1] || '';
      const cls = (at.match(/class=['\"]([^'\"]+)['\"]/i) || [,''])[1];
      const candidate = (at.match(/data-src=['\"]([^'\"]+)['\"]/i) || [,''])[1]
        || (function(){const s=(at.match(/srcset=['\"]([^'\"]+)['\"]/i)||[,null])[1]; if(!s) return null; const first=String(s).split(',')[0].trim().split(' ')[0]; return first||null;})()
        || (at.match(/src=['\"]([^'\"]+)['\"]/i) || [,''])[1];
      if (!candidate) continue;
      if (/spinner-bert\.gif/i.test(candidate)) continue;
      // Prefer portraits under /images/u/ and softened class when available
      if (/\/images\/u\//i.test(candidate) || /softened/i.test(cls)) return candidate;
    }
  } catch {}
  return src;
}

function balancedContainerContent(html, classA, classB) {
  // Find opening tag for div with both classes present
  const re = new RegExp('<div[^>]*class=["\'](?=[^"\']*' + classA + ')(?=[^"\']*' + classB + ')[^"\']*["\'][^>]*>', 'i');
  const open = re.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1; let t; let end = -1;
  while ((t = tagRe.exec(html))) {
    const tag = t[0];
    if (/^<div\b/i.test(tag)) depth++;
    else if (/^<\/div/i.test(tag)) depth--;
    if (depth === 0) { end = t.index; break; }
  }
  if (end < 0) return null;
  return html.slice(start, end);
}

function extractOnlineAndJoined(html) {
  const regionHtml = balancedContainerContent(html, 'reginald', 'Bp1');
  if (!regionHtml) return { online: null, joined: null };
  // Convert breaks and strip tags to analyze text
  let text = regionHtml.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
  let online = null;
  const mo = text.match(/\bonline\s+([a-z]+)/i);
  if (mo) online = mo[1].toLowerCase();
  let joined = null;
  const mj = text.match(/\bjoined\s+([^\n]+)$/i) || text.match(/\bjoined\s+([^<]+?)(?:\s|$)/i);
  if (mj) { joined = mj[1].trim(); }
  return { online, joined };
}

module.exports = { extractSellerImageUrl, extractOnlineAndJoined };


