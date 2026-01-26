"use client";

import Link from "next/link";
import { RedditIcon } from '@/components/common/icons';
import FlagGB from '@/components/common/flags/FlagGB';
import FlagDE from '@/components/common/flags/FlagDE';
import FlagFR from '@/components/common/flags/FlagFR';
import FlagIT from '@/components/common/flags/FlagIT';
import FlagPT from '@/components/common/flags/FlagPT';
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactElement, type MouseEvent as ReactMouseEvent } from "react";
import { useFormatter, useTranslations } from 'next-intl';

const LOCALE_LINKS = [
  { code: 'en', href: 'https://biggyindex.com', label: 'English', Flag: FlagGB },
  { code: 'fr', href: 'https://fr.biggyindex.com', label: 'Français', Flag: FlagFR },
  { code: 'de', href: 'https://de.biggyindex.com', label: 'Deutsch', Flag: FlagDE },
  { code: 'it', href: 'https://it.biggyindex.com', label: 'Italiano', Flag: FlagIT },
  { code: 'pt', href: 'https://pt.biggyindex.com', label: 'Português', Flag: FlagPT },
];

interface FooterSectionProps {
  lastCrawlTime?: string | number | null;
  buildTime?: string | number | null;
}

export default function FooterSection({ lastCrawlTime, buildTime }: FooterSectionProps): ReactElement {
  const year = new Date().getFullYear();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const footerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const format = useFormatter();
  const tHome = useTranslations('Home');

  const formattedLastCrawl = (() => {
    if (!lastCrawlTime) return null;
    const d = new Date(lastCrawlTime);
    if (Number.isNaN(d.getTime())) return null;
    return format.dateTime(d, { dateStyle: 'short', timeStyle: 'medium' });
  })();

  const formattedBuildTime = (() => {
    if (!buildTime) return null;
    const d = new Date(buildTime);
    if (Number.isNaN(d.getTime())) return null;
    return format.dateTime(d, { dateStyle: 'short', timeStyle: 'medium' });
  })();

  useEffect(() => {
    // Throttle mousemove with rAF for smoother gradient animation
    const handleMouseMove = (e: MouseEvent) => {
      if (!footerRef.current || rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        if (!footerRef.current) {
          rafRef.current = null;
          return;
        }
        const rect = footerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setMousePosition({ x, y });
        rafRef.current = null;
      });
    };

    const footer = footerRef.current;
    if (footer) {
      footer.addEventListener('mousemove', handleMouseMove);
      return () => {
        footer.removeEventListener('mousemove', handleMouseMove);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }
  }, []);

  return (
    <footer>
      <div
        ref={footerRef}
        className="relative overflow-hidden border-t border-slate-200/80 bg-slate-800 text-white transition-colors duration-300 dark:border-white/10 dark:text-slate-900"
        style={{ backgroundColor: 'var(--footer-bg)' }}
      >
        {/* Animated gradient orb that follows mouse */}
        <motion.div
          className="pointer-events-none absolute h-[600px] w-[600px] rounded-full bg-gradient-to-br from-emerald-500/20 via-blue-500/15 to-purple-500/10 blur-3xl"
          animate={{
            x: `${mousePosition.x}%`,
            y: `${mousePosition.y}%`,
          }}
          transition={{ type: "spring", damping: 50, stiffness: 100 }}
          style={{ transform: 'translate(-50%, -50%)' }}
        />

        {/* Top gradient fade */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-slate-800/95 to-transparent transition-colors duration-300 dark:from-slate-100/95"
        />

        {/* Subtle grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left column - Main content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400 backdrop-blur dark:border-emerald-600/30 dark:bg-emerald-600/10 dark:text-emerald-700">
                {tHome('footer.badge')}
              </div>
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl max-w-sm">
                {tHome('footer.title')}
              </h2>
              <p className="text-base leading-relaxed text-white/80 transition-colors duration-300 dark:text-slate-500 max-w-[27em]">
                {tHome('footer.description')}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-emerald-500/40"
                >
                  {tHome('footer.ctaBrowse')}
                  <span aria-hidden>→</span>
                </Link>
              </div>
            </motion.div>

            {/* Right column - Community links */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="flex flex-col justify-center space-y-6"
            >
              <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur transition-colors duration-300 dark:border-slate-200/20 dark:bg-slate-900/5">
                <span className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70 transition-colors duration-300 dark:text-slate-500">
                  {tHome('footer.community.label')}
                </span>
                <p className="text-sm leading-relaxed text-white/80 dark:text-slate-500 max-w-sm">
                  {tHome('footer.community.text')}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="https://www.reddit.com/r/LittleBiggy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10 dark:border-slate-300/20 dark:bg-slate-900/5 dark:hover:border-slate-300/30 dark:hover:bg-slate-900/10"
                  >
                    <RedditIcon className="h-6 w-6 text-white/80 transition group-hover:text-white dark:text-slate-700 dark:group-hover:text-slate-900" />
                    <span className="text-sm font-medium">{tHome('footer.community.reddit')}</span>
                  </Link>
                  <Link
                    href="https://littlebiggy.net/wall"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-lg font-semibold transition hover:border-white/20 hover:bg-white/10 dark:border-slate-300/20 dark:bg-slate-900/5 dark:hover:border-slate-300/30 dark:hover:bg-slate-900/10"
                    title={tHome('footer.community.wallTitle')}
                  >
                    <span className="text-white/80 group-hover:text-white dark:text-slate-700 dark:group-hover:text-slate-900">
                      {'{ }'}
                    </span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Language selector row */}
        <div className="relative border-t border-white/10 px-6 py-4 transition-colors duration-300 dark:border-slate-200/20">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-3">
            <span className="text-xs uppercase tracking-[0.2em] text-white/50 dark:text-slate-500">
              {tHome('footer.languages.label', { fallback: 'Also available in' })}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {LOCALE_LINKS.map(({ code, href, label, Flag }) => (
                <a
                  key={code}
                  href={href}
                  className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white dark:border-slate-300/20 dark:bg-slate-900/5 dark:text-slate-500 dark:hover:border-slate-300/30 dark:hover:bg-slate-900/10 dark:hover:text-slate-700"
                  hrefLang={code}
                >
                  <Flag className="h-4 w-4 rounded-sm" />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative border-t border-white/10 px-6 py-6 text-center text-xs transition-colors duration-300 dark:border-slate-200/20">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-white/60 dark:text-slate-500 sm:flex-row sm:justify-center">
            <span>{tHome('footer.meta.copyright', { year })}</span>
            {formattedLastCrawl && (
              <span className="opacity-80">{tHome('footer.meta.lastCrawled', { date: formattedLastCrawl })}</span>
            )}
            {formattedBuildTime && (
              <span className="opacity-70">{tHome('footer.meta.pageRefreshed', { date: formattedBuildTime })}</span>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
