/**
 * Community suggestion form — standalone page reached via "Suggest correction"
 * link on item detail. Posts structured category/subcategory corrections to the
 * suggestions worker. See workers/suggestions-api/ for the backend.
 */

import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { SuggestionForm } from "@/components/SuggestionForm";
import { loadItemByRef } from "@/lib/data";

interface Props {
  params: Promise<{ locale: string; ref: string }>;
}

async function SuggestContent({ params }: Props) {
  "use cache";
  cacheLife("item-detail");
  cacheTag("item-detail");
  const { ref, locale } = await params;
  const t = await getTranslations({ locale, namespace: "suggest.page" });
  const item = await loadItemByRef(ref);

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {t("itemNotFound")}
        </h1>
        <p className="mt-2 text-muted">{t("notFoundDescription")}</p>
        <Link
          href={`/${locale}/browse`}
          prefetch={false}
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("backToIndex")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href={`/${locale}/item/${ref}`}
        prefetch={false}
        className="mb-4 inline-block text-sm text-muted hover:text-foreground transition-colors"
      >
        ← {t("backToItem")}
      </Link>

      <div className="space-y-2 mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 mb-6">
        <div className="text-xs text-muted">{t("itemLabel")}</div>
        <div className="font-semibold text-foreground">{item.n}</div>
        {item.sn && (
          <div className="text-sm text-muted mt-0.5">
            {t("bySeller", { seller: item.sn })}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {item.c}
          </span>
          {item.sc?.map((s) => (
            <span
              key={s}
              className="rounded-md bg-background px-2 py-0.5 text-xs text-muted"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <SuggestionForm
        refNum={ref}
        itemName={item.n}
        sellerName={item.sn ?? undefined}
        item={item as unknown as Record<string, unknown>}
      />
    </div>
  );
}

export default function SuggestPage(props: Props) {
  return (
    <Suspense>
      <SuggestContent params={props.params} />
    </Suspense>
  );
}
