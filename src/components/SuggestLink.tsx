"use client";

import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Opens the /suggest/<ref> page in a centered popup window.
 *
 * With `iconOnly`, renders as a compact square icon button with a native
 * tooltip via `title` (no label text).
 */
export function SuggestLink({
  refNum,
  className,
  iconOnly,
}: {
  refNum: string | number;
  className?: string;
  iconOnly?: boolean;
}) {
  const t = useTranslations("suggest.link");

  const openPopup = () => {
    const w = 620;
    const h = 820;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    window.open(
      `/suggest/${encodeURIComponent(String(refNum))}`,
      "suggest",
      `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`,
    );
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={openPopup}
        title={t("title")}
        aria-label={t("title")}
        className={
          className ??
          "inline-flex items-center justify-center size-7 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
        }
      >
        <Flag size={13} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openPopup}
      className={
        className ??
        "flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
      }
    >
      <Flag size={12} />
      {t("label")}
    </button>
  );
}
