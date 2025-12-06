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
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50';
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-50';
    default:
      return 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-50';
  }
}

export default function AnnouncementBanner(): React.ReactElement | null {
  const { locale } = useLocale();
  const [dismissals, setDismissals] = useAtom(announcementBannerDismissalsAtom);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const message = pickMessage(locale);
  const id = announcementBanner.id;

  if (!id || !message) return null;
  if (dismissals && typeof dismissals === 'object' && dismissals[id]) return null;

  const close = () => {
    setDismissals((prev = {}) => ({ ...prev, [id]: new Date().toISOString() }));
  };

  const hasCta = Boolean(announcementBanner.href && announcementBanner.ctaLabel);
  const severity = announcementBanner.severity || 'info';

  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm shadow-sm transition-colors ${severityClasses(severity)}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-medium leading-relaxed">{message}</p>
          {hasCta && announcementBanner.href && announcementBanner.ctaLabel && (
            <a
              className="mt-2 inline-flex items-center text-sm font-semibold underline-offset-4 hover:underline"
              href={announcementBanner.href}
            >
              {announcementBanner.ctaLabel}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="ml-3 rounded-full p-1 text-current opacity-70 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
