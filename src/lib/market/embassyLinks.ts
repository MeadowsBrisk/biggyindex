/** LittleBiggy community-post short links for localized embassy help threads. */
export const EMBASSY_LINKS: Record<string, string> = {
  fr: "https://littlebiggy.org/link/AEQaVl",
  it: "https://littlebiggy.org/link/lFwOUG",
  pt: "https://littlebiggy.org/link/03kf61",
};

export function getEmbassyUrl(locale: string): string | undefined {
  const prefix = (locale || "en-GB").split("-")[0].toLowerCase();
  return EMBASSY_LINKS[prefix];
}
