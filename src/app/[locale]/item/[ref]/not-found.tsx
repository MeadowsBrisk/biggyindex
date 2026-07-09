/**
 * Item-specific 404. Rendered when item/[ref]/page.tsx (or its
 * generateMetadata) throws notFound() for a ref that has no live blob AND no
 * archive snapshot — i.e. a ref that was never in this market's index.
 * Archived (delisted) items are NOT 404s: they render the full page.
 */

import { getTranslations } from "next-intl/server";
import {
  NotFoundCategoryRow,
  NotFoundPrimaryLink,
  NotFoundView,
} from "@/components/NotFoundView";

export default async function ItemNotFound() {
  const t = await getTranslations("notFound.item");
  const tCta = await getTranslations("notFound.cta");

  return (
    <NotFoundView title={t("title")} description={t("description")}>
      <NotFoundPrimaryLink href="/browse">{tCta("browse")}</NotFoundPrimaryLink>
      <NotFoundCategoryRow />
    </NotFoundView>
  );
}
