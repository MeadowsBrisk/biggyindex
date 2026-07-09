import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`@/messages/${locale}/index.json`)).default,
    // Global default so server and client format dates/times identically
    // (silences next-intl's ENVIRONMENT_FALLBACK warning and prevents markup
    // mismatches). UTC matches the explicit timeZone the date helpers
    // already pass (e.g. fmtDate/shortDate on the item page).
    timeZone: "UTC",
  };
});
