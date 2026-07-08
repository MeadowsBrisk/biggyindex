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
  const t = await getTranslations({ locale, namespace: "legal.cookies" });

  return pageMetadata({
    market,
    path: "/cookies",
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  });
}

/** Row keys under legal.cookies.rows — the functional storage we use. */
const ROW_KEYS = ["locale", "preferences"] as const;

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("config");

  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.cookies" });

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

          <div className="mt-8 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  <th className="px-4 py-3 font-semibold text-foreground">
                    {t("table.name")}
                  </th>
                  <th className="px-4 py-3 font-semibold text-foreground">
                    {t("table.type")}
                  </th>
                  <th className="px-4 py-3 font-semibold text-foreground">
                    {t("table.purpose")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROW_KEYS.map((key, i) => (
                  <tr
                    key={key}
                    className={i > 0 ? "border-t border-border" : undefined}
                  >
                    <td className="px-4 py-3 align-top font-medium text-foreground whitespace-nowrap">
                      {t(`rows.${key}.name`)}
                    </td>
                    <td className="px-4 py-3 align-top text-muted whitespace-nowrap">
                      {t(`rows.${key}.type`)}
                    </td>
                    <td className="px-4 py-3 align-top text-muted leading-relaxed">
                      {t(`rows.${key}.purpose`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-8 text-sm text-muted leading-relaxed">
            {t("outro")}
          </p>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
