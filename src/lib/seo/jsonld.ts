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

/**
 * Reduce rendered copy to the plain text structured data should carry.
 * Answers are authored as prose in the message catalogue, but a stray tag
 * or entity must never reach a JSON-LD string.
 */
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface FaqEntry {
  q: string;
  a: string;
}

/**
 * FAQPage structured data built from the SAME translated strings the visible
 * FAQ renders — passing the copy in (rather than re-authoring it here) is
 * what keeps the markup and the page in agreement.
 */
export function faqPageJsonLd(entries: readonly FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map(({ q, a }) => ({
      "@type": "Question",
      name: plainText(q),
      acceptedAnswer: {
        "@type": "Answer",
        text: plainText(a),
      },
    })),
  };
}
