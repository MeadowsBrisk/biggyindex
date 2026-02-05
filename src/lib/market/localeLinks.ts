import FlagGB from '@/components/common/flags/FlagGB';
import FlagDE from '@/components/common/flags/FlagDE';
import FlagFR from '@/components/common/flags/FlagFR';
import FlagIT from '@/components/common/flags/FlagIT';
import FlagPT from '@/components/common/flags/FlagPT';
import type { ComponentType } from 'react';

export interface LocaleLink {
  code: string;
  href: string;
  label: string;
  Flag: ComponentType<{ className?: string }>;
}

/**
 * Canonical list of locale links for language switchers and footers.
 * Add new markets here — all consumers auto-update.
 */
export const LOCALE_LINKS: LocaleLink[] = [
  { code: 'en', href: 'https://biggyindex.com', label: 'English', Flag: FlagGB },
  { code: 'fr', href: 'https://fr.biggyindex.com', label: 'Français', Flag: FlagFR },
  { code: 'de', href: 'https://de.biggyindex.com', label: 'Deutsch', Flag: FlagDE },
  { code: 'it', href: 'https://it.biggyindex.com', label: 'Italiano', Flag: FlagIT },
  { code: 'pt', href: 'https://pt.biggyindex.com', label: 'Português', Flag: FlagPT },
];
