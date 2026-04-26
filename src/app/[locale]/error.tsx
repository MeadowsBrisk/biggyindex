"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.global");

  useEffect(() => {
    console.error("[BiggyIndex] Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] px-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="max-w-md text-sm text-muted">{t("description")}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
      >
        {t("retry")}
      </button>
    </div>
  );
}
