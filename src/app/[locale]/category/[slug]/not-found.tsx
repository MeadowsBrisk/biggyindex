/**
 * Category-specific 404. Rendered when category/[slug]/page.tsx (or its
 * generateMetadata) throws notFound() for a slug that maps to no real
 * category. The 11 real category landing pages are offered as the recovery.
 */

import { getTranslations } from "next-intl/server";
import { NotFoundCategoryRow, NotFoundView } from "@/components/NotFoundView";

export default async function CategoryNotFound() {
  const t = await getTranslations("notFound.category");

  return (
    <NotFoundView title={t("title")} description={t("description")}>
      <NotFoundCategoryRow />
    </NotFoundView>
  );
}
