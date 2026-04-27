"use client";

import { ExternalLink, MessageCircleQuestion } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useLBGuideGate } from "@/hooks/useLBGuideGate";
import { getEmbassyUrl } from "@/lib/market/embassyLinks";
import { localeToMarket } from "@/lib/market/market";
import {
  extractLittleBiggyId,
  normalizeLittleBiggyUrl,
} from "@/lib/tracking/littlebiggy";

export function EmbassySection() {
  const t = useTranslations("home.embassy");
  const locale = useLocale();
  const url = getEmbassyUrl(locale);

  const outboundEvent = useMemo(() => {
    if (!url) return null;

    const normalizedUrl = normalizeLittleBiggyUrl(url);
    return {
      id: extractLittleBiggyId(normalizedUrl),
      url: normalizedUrl,
      n: t("title"),
      c: "Community",
      mkt: localeToMarket(locale),
    };
  }, [locale, t, url]);

  const handleClick = useLBGuideGate(outboundEvent);

  if (!url || !outboundEvent) return null;

  return (
    <section className="border-y border-border bg-surface px-4 py-14">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <MessageCircleQuestion size={24} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t("badge")}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">
              {t("title")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <a
          href={outboundEvent.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 md:w-auto"
        >
          {t("cta")}
          <ExternalLink size={15} />
        </a>
      </div>
    </section>
  );
}
