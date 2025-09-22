// Parse sellerRef (subject ref) from HTML share form tokens.
// Returns sellerRef string or null.
function parseSellerRef(html) {
  if (!html) return null;
  try {
    // Reuse the share form pattern but do not assume shareForm class strictly
    // Look for any input name="contextRefNum"
    const m = html.match(/<input[^>]+name=["']contextRefNum["'][^>]*value=["']([^"']+)["']/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

module.exports = { parseSellerRef };


