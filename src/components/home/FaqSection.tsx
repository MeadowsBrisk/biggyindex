"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface FaqItem {
  id: string;
  q: string;
  a: string;
}

type Tab = "about" | "bitcoin";

const TABS: { key: Tab; labelKey: string }[] = [
  { key: "about", labelKey: "tabs.about" },
  { key: "bitcoin", labelKey: "tabs.bitcoin" },
];

const FAQ_KEYS: Record<Tab, string[]> = {
  about: [
    "whatIs",
    "sellOrShip",
    "dataSource",
    "refreshRate",
    "timestamps",
    "endorsements",
  ],
  bitcoin: [
    "payments",
    "buying",
    "wallet",
    "escrow",
    "mistakes",
    "clearnet",
    "legality",
  ],
};

export function FaqSection() {
  const t = useTranslations("home.faq");
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [expanded, setExpanded] = useState<number | null>(null);

  const faqs: FaqItem[] = FAQ_KEYS[activeTab].map((key) => ({
    id: key,
    q: t(`${activeTab}.items.${key}.q`),
    a: t(`${activeTab}.items.${key}.a`),
  }));

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setExpanded(null);
  };

  return (
    <section className="py-20 px-4 bg-[var(--background)]">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
            {t("eyebrow")}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            {t("heading")}
          </h2>
        </motion.div>

        {/* Tab switcher */}
        <div className="flex justify-center mb-8">
          <div className="flex gap-1 rounded-xl bg-[var(--surface)] p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? "bg-primary/15 text-primary"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isExpanded = expanded === i;
            return (
              <motion.div
                key={`${activeTab}-${faq.id}`}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : i)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-[var(--card-hover)]"
                >
                  <span className="text-sm font-semibold text-foreground">
                    {faq.q}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-0 text-sm text-muted leading-relaxed border-t border-[var(--border)]">
                        <p className="pt-4">{faq.a}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
