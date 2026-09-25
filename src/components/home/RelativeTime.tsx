"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { relativeAge } from "@/lib/relative-age";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function absoluteUtc(iso: string, locale: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(t);
}

/** Absolute UTC on the server (the page is cached for hours), relative after mount. */
export function useAgeLabel(): (iso: string) => string {
  const locale = useLocale();
  const t = useTranslations("home.time");
  const mounted = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  return (iso) => {
    const age = mounted ? relativeAge(iso, Date.now()) : null;
    if (!age) return absoluteUtc(iso, locale);
    if (age.unit === "minutes")
      return age.count < 5
        ? t("justNow")
        : t("minutesAgo", { count: age.count });
    if (age.unit === "hours") return t("hoursAgo", { count: age.count });
    if (age.unit === "days")
      return age.count === 1
        ? t("oneDayAgo")
        : t("daysAgo", { count: age.count });
    return t("monthsAgo", { count: age.count });
  };
}

export function RelativeTime({ iso }: { iso: string }) {
  const label = useAgeLabel()(iso);
  return (
    <span suppressHydrationWarning className="home-reltime">
      {label}
    </span>
  );
}
