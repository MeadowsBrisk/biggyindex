// Normalize raw review objects into consistent shape with segments array.
// NOTE: Plain concatenated text field removed to avoid duplication (segments already hold text).
function normalizeReviews(rawReviews, { captureMedia = true } = {}) {
  if (!Array.isArray(rawReviews)) return [];
  return rawReviews.map(r => {
    const segments = [];
    if (Array.isArray(r.content)) {
      for (const part of r.content) {
        if (!part) continue;
        if (part.contentType === 'plain') {
          if (typeof part.value === 'string') {
            const raw = part.value;
            if (raw.trim()) {
              // Preserve original text (including internal newlines) when it has non-whitespace
              segments.push({ type: 'text', value: raw });
            } else if (/\r|\n/.test(raw)) {
              // Whitespace-only but contains line breaks: treat as paragraph separator
              const prev = segments[segments.length - 1];
              // Avoid piling up multiple separators; represent as double newline
              if (!(prev && prev.type === 'text' && /\n\n$/.test(prev.value))) {
                segments.push({ type: 'text', value: '\n\n' });
              }
            }
          }
        } else if (captureMedia && part.contentType === 'blot' && part.blotName === 'image') {
          if (typeof part.value === 'string') {
            segments.push({ type: 'image', url: part.value });
          }
        } else if (part.contentType && part.value) {
          // retain unknown types generically (future-proof)
            segments.push({ type: part.contentType, value: part.value });
        }
      }
    }
    return {
      id: r.id,
      created: r.created,
      rating: r.rating,
      daysToArrive: r.daysToArrive,
      authorId: r.author && r.author.id || null,
      flags: r.flags || 0,
      segments
    };
  });
}
module.exports = { normalizeReviews };
