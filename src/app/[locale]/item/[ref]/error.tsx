"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function ItemDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.item");

  useEffect(() => {
    console.error("[BiggyIndex] Item detail error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-bold text-foreground">{t("title")}</h2>
      <p className="max-w-md text-sm text-muted">{t("description")}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
        >
          {t("retry")}
        </button>
        <a
          href="/browse"
          className="rounded-lg border border-[var(--border)] px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[var(--surface-hover)]"
        >
          {t("browseItems")}
        </a>
      </div>
    </div>
  );
}
