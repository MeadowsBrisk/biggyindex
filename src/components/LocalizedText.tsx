"use client";

import { useAtomValue } from "jotai";
import { forceEnglishAtom } from "@/store/atoms";

interface Props {
  /** Translated text (locale-specific, shown by default on non-GB markets) */
  translated?: string | null;
  /** English original (shown when forceEnglish is on) */
  english?: string | null;
  /** Optional className for the wrapping span */
  className?: string;
  /** When true, `whitespace-pre-line` for multi-line descriptions */
  preserveNewlines?: boolean;
}

/**
 * Renders translated text on non-GB markets, but swaps to the English
 * original when `forceEnglishAtom` is on (via ShowOriginalToggle).
 *
 * Falls back gracefully: if the preferred variant is missing, uses the other.
 */
export function LocalizedText({
  translated,
  english,
  className,
  preserveNewlines,
}: Props) {
  const forceEnglish = useAtomValue(forceEnglishAtom);
  const text = forceEnglish ? english || translated : translated || english;
  if (!text) return null;
  return (
    <span
      className={`${className ?? ""} ${preserveNewlines ? "whitespace-pre-line" : ""}`.trim()}
    >
      {text}
    </span>
  );
}
