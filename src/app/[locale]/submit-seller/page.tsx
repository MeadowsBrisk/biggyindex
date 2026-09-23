import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { localeToMarket } from "@/lib/market/market";
import { pageMetadata } from "@/lib/seo/metadata";
import { SubmitSellerForm } from "./SubmitSellerForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const market = localeToMarket(locale);
  const t = await getTranslations({ locale, namespace: "submitSeller" });

  return pageMetadata({
    market,
    path: "/submit-seller",
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  });
}

export default async function SubmitSellerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("config");

  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "submitSeller" });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="text-3xl font-bold text-foreground">{t("heading")}</h1>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            {t("intro")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {t("flaggedIntro")}
          </p>
          <div className="mt-8">
            <SubmitSellerForm />
          </div>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
