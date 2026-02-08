/**
 * Embassy help-post links per locale code.
 *
 * Each embassy is a LittleBiggy community post where a native speaker
 * welcomes newcomers and answers questions in their language.
 * To add a new market, append an entry here — all consumers auto-update.
 */
export const EMBASSY_LINKS: Record<string, string> = {
  fr: "https://littlebiggy.net/link/AEQaVl",
  it: "https://littlebiggy.net/link/lFwOUG",
  pt: "https://littlebiggy.net/link/03kf61",
};

/** Returns the embassy URL for the given locale string (e.g. "fr-FR" → fr key). */
export function getEmbassyUrl(locale: string): string | undefined {
  const prefix = (locale || "en-GB").split("-")[0].toLowerCase();
  return EMBASSY_LINKS[prefix];
}
