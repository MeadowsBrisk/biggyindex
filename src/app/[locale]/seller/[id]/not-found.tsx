/**
 * Seller-specific 404. Rendered when seller/[id]/page.tsx (or its
 * generateMetadata) throws notFound() for an id that is absent from THIS
 * market's seller list (GB/IE are distinct) or is not a numeric id.
 */

import { getTranslations } from "next-intl/server";
import {
  NotFoundPrimaryLink,
  NotFoundSecondaryLink,
  NotFoundView,
} from "@/components/NotFoundView";

export default async function SellerNotFound() {
  const t = await getTranslations("notFound.seller");
  const tCta = await getTranslations("notFound.cta");

  return (
    <NotFoundView title={t("title")} description={t("description")}>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <NotFoundPrimaryLink href="/sellers">
          {tCta("sellers")}
        </NotFoundPrimaryLink>
        <NotFoundSecondaryLink href="/browse">
          {tCta("browse")}
        </NotFoundSecondaryLink>
      </div>
    </NotFoundView>
  );
}
