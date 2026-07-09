/**
 * Generic (catch-all) 404 for the locale subtree. Renders for notFound()
 * thrown anywhere under [locale] that has no nearer boundary — e.g. hub pages
 * or a bad locale in the layout. The per-type boundaries (item/seller/category)
 * override this with tailored copy.
 *
 * Truly unmatched URLs (/fr-FR/does-not-exist) and non-locale traffic
 * (/bogus.xyz) fall to the ROOT app/not-found.tsx instead — this boundary only
 * catches notFound() raised INSIDE the locale tree.
 */

import { getTranslations } from "next-intl/server";
import {
  NotFoundPrimaryLink,
  NotFoundSecondaryLink,
  NotFoundView,
} from "@/components/NotFoundView";

export default async function NotFound() {
  const t = await getTranslations("notFound.generic");
  const tCta = await getTranslations("notFound.cta");

  return (
    <NotFoundView title={t("title")} description={t("description")}>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <NotFoundPrimaryLink href="/browse">
          {tCta("browse")}
        </NotFoundPrimaryLink>
        <NotFoundSecondaryLink href="/sellers">
          {tCta("sellers")}
        </NotFoundSecondaryLink>
        <NotFoundSecondaryLink href="/">{tCta("home")}</NotFoundSecondaryLink>
      </div>
    </NotFoundView>
  );
}
