export interface ShareFormTokens { contextRefNum?: string; contextId?: string; _sourcePage?: string; __fp?: string; contextType?: string }

export function parseShareForm(html: string): ShareFormTokens | null {
  if (!html) return null;
  try {
    const formMatch = html.match(/<form[^>]*class="[^"]*shareForm[^"]*"[\s\S]*?<\/form>/i);
    const scope = formMatch ? formMatch[0] : html;
    const getVal = (name: string) => {
      const m = scope.match(new RegExp(`<input[^>]+name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i'));
      return m ? m[1] : undefined;
    };
    const contextRefNum = getVal('contextRefNum');
    const contextId = getVal('contextId');
    if (!contextRefNum && !contextId) return null;
    const _sourcePage = getVal('_sourcePage');
    const __fp = getVal('__fp');
    const contextType = getVal('contextType') || (contextId ? 'SUBJECT' : 'ITEM');
    return { contextRefNum, contextId, _sourcePage, __fp, contextType };
  } catch { return null; }
}