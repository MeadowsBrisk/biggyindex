"use client";

import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";
import { useEffect } from "react";

/**
 * Loads a tiny webfont (Twemoji Country Flags, ~50 KB woff2 with
 * unicode-range scoped to U+1F1E6–U+1F1FF) iff the current browser/OS
 * doesn't natively render regional indicator pairs as country flags.
 *
 * In practice this only fires on Windows (Segoe UI Emoji ships no flag
 * glyphs); macOS/iOS/Android already render flags so the call is a no-op
 * there and no font is downloaded.
 *
 * Pairs with the body `font-family` chain in `globals.css`, which lists
 * "Twemoji Country Flags" first so the browser picks it up for flag
 * codepoints once the @font-face is injected. Renders nothing.
 */
export function FlagFontPolyfill() {
  useEffect(() => {
    polyfillCountryFlagEmojis();
  }, []);
  return null;
}
