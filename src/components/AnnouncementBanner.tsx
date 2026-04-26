"use client";

import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import type { AnnouncementSeverity } from "@/lib/announcement";

/** Record of bannerId → ISO-dismissed-at timestamp. */
export const announcementBannerDismissalsAtom = atomWithStorage<
  Record<string, string>
>("bi:v2:announcement-dismissals", {});

function severityClasses(severity: AnnouncementSeverity = "info") {
  switch (severity) {
    case "warning":
      return "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
    case "success":
      return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
    default:
      return "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
  }
}

interface AnnouncementBannerProps {
  id: string;
  message: string;
  severity?: AnnouncementSeverity;
  href?: string;
  ctaLabel?: string;
}

export function AnnouncementBanner({
  id,
  message,
  severity = "info",
  href,
  ctaLabel,
}: AnnouncementBannerProps) {
  const [dismissals, setDismissals] = useAtom(announcementBannerDismissalsAtom);
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !id || !message) return null;
  const isDismissed =
    dismissals && typeof dismissals === "object" && dismissals[id];
  if (isDismissed && !isClosing) return null;

  const close = () => {
    setIsClosing(true);
    setTimeout(() => {
      setDismissals((prev = {}) => ({
        ...prev,
        [id]: new Date().toISOString(),
      }));
    }, 300);
  };

  const hasCta = Boolean(href && ctaLabel);

  return (
    <div
      className={`grid transition-all duration-300 ease-out ${
        isClosing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
    >
      <div className="overflow-hidden">
        <div
          className={`w-full px-4 py-1.5 text-xs transition-colors ${severityClasses(severity)}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between">
            <div className="w-6 hidden sm:block" />
            <div className="flex-1 flex items-center justify-center gap-2 text-center sm:text-left sm:flex-none">
              <p className="font-medium">
                {message.split("{{mbr}}").map((part, i, arr) => (
                  <Fragment key={`${id}-${i}`}>
                    {part}
                    {i < arr.length - 1 && <br className="sm:hidden" />}
                  </Fragment>
                ))}
              </p>
              {hasCta && href && ctaLabel && (
                <a
                  className="font-semibold underline underline-offset-2 hover:no-underline"
                  href={href}
                >
                  {ctaLabel}
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              className="rounded p-0.5 opacity-60 transition hover:opacity-100 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-current"
              aria-label="Dismiss banner"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
