"use client";

import { useMemo, useState, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fadeInUp } from "@/sections/home/motionPresets";
import ChevronDown from "@/components/common/icons/ChevronDown";
import { useTranslations } from 'next-intl';

interface FaqItem {
  question?: string;
  q?: string;
  answer?: string;
  a?: string;
}

interface AccordionItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function AccordionItem({ question, answer, isOpen, onToggle }: AccordionItemProps): ReactElement {
  return (
    <motion.div
      layout
      whileHover={{ y: -4 }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow duration-200 hover:shadow-lg hover:shadow-emerald-500/15 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-base font-medium text-slate-900 dark:text-white"
      >
        <span>{question}</span>
        <span className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition-transform duration-300 ${isOpen ? "border-emerald-400 text-emerald-500" : "border-slate-200 text-slate-500 dark:border-white/20 dark:text-white/80"}`}>
          <ChevronDown className={`transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="overflow-hidden">
              <div className="px-6 pb-6 text-sm text-slate-600 dark:text-white/70 max-w-3xl">
                {answer}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface AccordionProps {
  questions: FaqItem[];
}

function Accordion({ questions }: AccordionProps): ReactElement {
  const [openIndex, setOpenIndex] = useState(0);
  const items = Array.isArray(questions) ? questions : [];

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => {
        const question = item?.question ?? item?.q ?? "";
        const answer = item?.answer ?? item?.a ?? "";
        return (
          <AccordionItem
            key={`${question}-${index}`}
            question={question}
            answer={answer}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
          />
        );
      })}
    </div>
  );
}

interface Tab {
  key: string;
  label: string;
  questions: FaqItem[];
}

export default function FaqSection(): ReactElement {
  const tHome = useTranslations('Home');
  const tabs = useMemo<Tab[]>(() => ([
    { key: 'about', label: tHome('faq.tabs.about'), questions: tHome.raw('faq.about') || [] },
    { key: 'crypto', label: tHome('faq.tabs.crypto'), questions: tHome.raw('faq.crypto') || [] },
  ]), [tHome]);
  const [activeTab, setActiveTab] = useState('about');
  const currentTab = useMemo(() => tabs.find((tab) => tab.key === activeTab) ?? tabs[0], [activeTab, tabs]);

  return (
    <section className="relative overflow-hidden bg-slate-100 py-20 transition-colors duration-300 dark:bg-slate-950" id="faq">
      <div className="absolute inset-0" aria-hidden>
        <div className="pointer-events-none absolute left-1/2 top-10 h-48 w-48 -translate-x-1/2 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
        <div className="pointer-events-none absolute right-10 bottom-0 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-white/60">{tHome('faq.label', { fallback: 'FAQs' })}</span>
          <h2 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">{tHome('faq.title', { fallback: 'FAQs for first-time Biggy explorers' })}</h2>
          <p className="mt-3 text-base text-slate-600 dark:text-white/70">{tHome('faq.subtitle', { fallback: 'Two quick panels: one about how Biggy Index works, another covering LittleBiggy payments and crypto basics.' })}</p>
        </div>
        <div className="mt-10 flex justify-center gap-3">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 dark:focus-visible:ring-offset-slate-950 ${
                  isActive
                    ? "bg-emerald-500 text-slate-950 shadow shadow-emerald-500/40"
                    : "border border-slate-300 text-slate-600 hover:border-emerald-400/60 hover:text-emerald-600 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="mt-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab.key}
              {...(fadeInUp({ distance: 12, duration: 0.25, viewportAmount: 1, once: false }) as any)}
            >
              <Accordion questions={currentTab.questions} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
