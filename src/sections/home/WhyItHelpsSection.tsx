import { motion } from "framer-motion";
import { fadeInUp } from "@/sections/home/motionPresets";
import { useTranslations } from 'next-intl';
import type { ReactElement } from "react";

interface HighlightItem {
  title: string;
  description: string;
}

export default function WhyItHelpsSection(): ReactElement {
  const tHome = useTranslations('Home');
  const highlights = tHome.raw('why.highlights') as HighlightItem[];
  
  return (
    <section className="bg-slate-100 py-20 transition-colors duration-300 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-white/60">{tHome('why.label')}</span>
          <h2 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">{tHome('why.title')}</h2>
          <p className="mt-3 text-base text-slate-600 dark:text-white/70">{tHome('why.subtitle')}</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.isArray(highlights) && highlights.map((item, index) => (
            <motion.div
              key={item.title}
              {...(fadeInUp({ distance: 20, duration: 0.45, delay: index * 0.05, trigger: "view", viewportAmount: 0.4 }) as any)}
              whileHover={{ y: -8 }}
              whileFocus={{ y: -8 }}
              className="rounded-3xl border border-white/60 bg-white p-6 text-left shadow-md shadow-black/10 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-black/20 transition-colors duration-200 hover:border-emerald-400/40"
            >
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-white/70">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
