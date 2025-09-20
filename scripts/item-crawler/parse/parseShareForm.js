// parseShareForm.js - extract share form hidden tokens and contextRefNum
// Returns { contextRefNum, _sourcePage, __fp, contextType } or null
function parseShareForm(html) {
  if (!html) return null;
  try {
    // Narrow to share form region if possible
    let formMatch = html.match(/<form[^>]*class="[^"]*shareForm[^"]*"[\s\S]*?<\/form>/i);
    const scope = formMatch ? formMatch[0] : html;
    const getVal = (name) => {
      const m = scope.match(new RegExp(`<input[^>]+name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i'));
      return m ? m[1] : undefined;
    };
    const contextRefNum = getVal('contextRefNum');
    if (!contextRefNum) return null; // essential
    const _sourcePage = getVal('_sourcePage');
    const __fp = getVal('__fp');
    const contextType = getVal('contextType') || 'ITEM';
    return { contextRefNum, _sourcePage, __fp, contextType };
  } catch { return null; }
}
module.exports = { parseShareForm };

