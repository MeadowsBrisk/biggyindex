/**
 * Serialize a JSON-LD object for a <script type="application/ld+json">.
 *
 * Escapes "<" so user-supplied content (item descriptions, seller
 * manifestos) containing "</script>" cannot break out of the script
 * element — raw JSON.stringify into dangerouslySetInnerHTML is XSS.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
