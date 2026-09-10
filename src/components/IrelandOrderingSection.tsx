/**
 * "Ordering from Ireland" — the IE edition's market-specific fact panel.
 *
 * Server-rendered so the figures are in the crawled HTML, and rendered only
 * where the market is IE. Every number is passed in from the live Irish
 * catalogue; nothing here is hard-coded.
 */

import { getTranslations } from "next-intl/server";
import { fmtPrice } from "@/lib/format";
import type { ServerCurrency } from "@/lib/market/currency";
import type { IrelandOrderingFacts } from "@/lib/market/ireland";

interface IrelandOrderingSectionProps {
  facts: IrelandOrderingFacts;
  currency: ServerCurrency;
  locale: string;
  /**
   * "band" is the full-bleed home-page section between the hero and What's
   * New; "panel" sits inside the /about prose column.
   */
  variant?: "band" | "panel";
}

interface Tile {
  key: string;
  value: string;
  label: string;
  meta: string;
}

export async function IrelandOrderingSection({
  facts,
  currency,
  locale,
  variant = "band",
}: IrelandOrderingSectionProps) {
  const t = await getTranslations({ locale, namespace: "ireland.ordering" });

  const tiles: Tile[] = [
    {
      key: "sellers",
      value: facts.sellers.toLocaleString(),
      label: t("sellers.label", { count: facts.sellers }),
      meta: t("sellers.meta", { listings: facts.listings }),
    },
  ];

  if (facts.shippingUsd != null) {
    tiles.push({
      key: "shipping",
      value: fmtPrice(facts.shippingUsd, currency.symbol, currency.rate),
      label: t("shipping.label"),
      meta: t("shipping.meta", {
        withShipping: facts.listingsWithShipping,
        listings: facts.listings,
      }),
    });
  }

  if (facts.deliveryDays != null) {
    tiles.push({
      key: "delivery",
      value: t("delivery.value", { days: Math.round(facts.deliveryDays) }),
      label: t("delivery.label"),
      meta: t("delivery.meta", { sellers: facts.deliverySellers }),
    });
  }

  // Literal class strings — Tailwind cannot see a composed one.
  const gridColumns =
    tiles.length >= 3
      ? "sm:grid-cols-3"
      : tiles.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-1";

  const body = (
    <>
      <div className={`mt-6 grid max-w-3xl gap-3 ${gridColumns}`}>
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-lg font-bold text-foreground">{tile.value}</p>
            <p className="mt-1 text-xs leading-snug text-muted">{tile.label}</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {tile.meta}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {t("note")}
      </p>
    </>
  );

  if (variant === "panel") {
    return (
      <section id="ireland" className="mt-10 scroll-mt-24">
        <h2 className="mb-2 text-lg font-semibold text-foreground">
          {t("heading")}
        </h2>
        <p className="text-sm leading-relaxed text-muted">{t("intro")}</p>
        {body}
      </section>
    );
  }

  return (
    <section className="border-y border-border bg-surface px-4 py-14">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {t("eyebrow")}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("heading")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          {t("intro")}
        </p>
        {body}
      </div>
    </section>
  );
}
