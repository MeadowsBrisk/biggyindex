import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { localeToMarket } from "@/lib/market/market";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const market = localeToMarket(locale);
  const t = await getTranslations({ locale, namespace: "legal.privacy" });

  return pageMetadata({
    market,
    path: "/privacy",
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  });
}

/** Section keys under legal.privacy.sections — rendered in order. */
const SECTION_KEYS = [
  "noAccounts",
  "noTracking",
  "functionalStorage",
  "listingData",
  "contact",
] as const;

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("config");

  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-2 text-xs text-muted">{t("updated")}</p>
          <p className="mt-6 text-sm text-muted leading-relaxed">
            {t("intro")}
          </p>

          <div className="mt-10 space-y-8">
            {SECTION_KEYS.map((key) => (
              <section key={key}>
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  {t(`sections.${key}.heading`)}
                </h2>
                <p className="text-sm text-muted leading-relaxed">
                  {t(`sections.${key}.body`)}
                </p>
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
