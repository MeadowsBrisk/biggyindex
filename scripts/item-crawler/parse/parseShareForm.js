// parseShareForm.js - extract share form hidden tokens and contextRefNum
// Returns { contextRefNum, contextId, _sourcePage, __fp, contextType, scopeHtml, fields } or null
function parseShareForm(html, expectedRef) {
  if (!html) return null;
  try {
    // Collect all candidate share forms
    const forms = Array.from(html.matchAll(/<form[^>]*class=["'][^"']*shareForm[^"']*["'][\s\S]*?<\/form>/gi)).map(m=>m[0]);
    const scopes = forms.length ? forms : [html];
    const parseScope = (scope) => {
      const fields = {};
      try {
        for (const m of scope.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi)) {
          const name = m[1];
          const value = m[2];
          if (name) fields[name] = value;
        }
      } catch {}
      const getVal = (name) => (fields[name] !== undefined ? fields[name] : undefined);
      const contextRefNum = getVal('contextRefNum');
      const contextId = getVal('contextId'); // user (seller) id form uses contextId
      if (!contextRefNum && !contextId) return null; // need at least one
      const _sourcePage = getVal('_sourcePage');
      const __fp = getVal('__fp');
      const contextType = getVal('contextType') || (contextId ? 'SUBJECT' : 'ITEM');
      return { contextRefNum, contextId, _sourcePage, __fp, contextType, scopeHtml: scope, fields };
    };
    // Prefer a form that matches the expected ref
    let best = null;
    for (const s of scopes) {
      const parsed = parseScope(s);
      if (!parsed) continue;
      if (expectedRef && parsed.contextRefNum && String(parsed.contextRefNum) === String(expectedRef)) {
        return parsed;
      }
      if (!best) best = parsed;
    }
    return best;
  } catch { return null; }
}
module.exports = { parseShareForm };

