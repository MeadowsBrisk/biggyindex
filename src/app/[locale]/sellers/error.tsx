"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function SellersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("seller.error");

  useEffect(() => {
    console.error("[BiggyIndex] Sellers error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-bold text-foreground">{t("title")}</h2>
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
