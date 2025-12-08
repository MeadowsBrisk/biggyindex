import React from 'react';
import { X } from 'lucide-react';
import { useAtom } from 'jotai';
import { announcementBanner } from '@/config/announcementBanner';
import { announcementBannerDismissalsAtom } from '@/store/atoms';
import { useLocale } from '@/providers/IntlProvider';

function pickMessage(locale: string | null | undefined): string {
  const { messageByLocale, allowedLocales } = announcementBanner;
  if (!messageByLocale) return '';
  const normalized = (locale || 'en-GB').toString();
  const base = normalized.split('-')[0];
  if (Array.isArray(allowedLocales) && allowedLocales.length) {
    const isAllowed = allowedLocales.includes(normalized) || allowedLocales.includes(base);
    if (!isAllowed) return '';
  }
  const primary = messageByLocale[normalized];
  if (primary) return primary;
  if (base && messageByLocale[base]) return messageByLocale[base];
  if (Array.isArray(allowedLocales) && allowedLocales.length) return '';
  return messageByLocale['en-GB'] || Object.values(messageByLocale)[0] || '';
}

type Severity = NonNullable<typeof announcementBanner.severity>;

function severityClasses(severity: Severity = 'info') {
  switch (severity) {
    case 'warning':
      return 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
    case 'success':
      return 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
    default:
      return 'bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300';
  }
}

export default function AnnouncementBanner(): React.ReactElement | null {
  const { locale } = useLocale();
  const [dismissals, setDismissals] = useAtom(announcementBannerDismissalsAtom);
  const [mounted, setMounted] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const message = pickMessage(locale);
  const id = announcementBanner.id;

  const isDismissed = dismissals && typeof dismissals === 'object' && dismissals[id];

  // Don't render at all if not mounted or no message
  if (!mounted) return null;
  if (!id || !message) return null;
  // Only hide after animation completes
  if (isDismissed && !isClosing) return null;

  const close = () => {
    setIsClosing(true);
    // Wait for animation to complete before actually dismissing
    setTimeout(() => {
      setDismissals((prev = {}) => ({ ...prev, [id]: new Date().toISOString() }));
    }, 300);
  };

  const hasCta = Boolean(announcementBanner.href && announcementBanner.ctaLabel);
  const severity = announcementBanner.severity || 'info';

  return (
    <div
      className={`grid transition-all duration-300 ease-out ${isClosing ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
        }`}
    >
      <div className="overflow-hidden">
        <div
          className={`w-full px-4 py-1.5 text-xs transition-colors ${severityClasses(severity)}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between">
            {/* Spacer to balance the close button and keep text centered */}
            <div className="w-6 hidden sm:block" />
            <div className="flex-1 flex items-center justify-center gap-2 text-center sm:text-left sm:flex-none">
              <p className="font-medium">
                {message.split('{{mbr}}').map((part, i, arr) => (
                  <React.Fragment key={i}>
                    {part}
                    {i < arr.length - 1 && <br className="sm:hidden" />}
                  </React.Fragment>
                ))}
              </p>
              {hasCta && announcementBanner.href && announcementBanner.ctaLabel && (
                <a
                  className="font-semibold underline underline-offset-2 hover:no-underline"
                  href={announcementBanner.href}
                >
                  {announcementBanner.ctaLabel}
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              className="rounded p-0.5 opacity-60 transition hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-current"
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
