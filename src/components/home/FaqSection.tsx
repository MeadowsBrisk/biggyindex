"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

type Tab = "about" | "bitcoin";

const TABS: { key: Tab; label: string }[] = [
  { key: "about", label: "About Biggy Index" },
  { key: "bitcoin", label: "Little Biggy & Bitcoin" },
];

const ABOUT_FAQS: FaqItem[] = [
  {
    q: "What is the Biggy Index?",
    a: "The Biggy Index provides an easier way to browse the Little Biggy marketplace, with item categorisation, additional sorting options, and other handy tools tailored for UK shoppers.",
  },
  {
    q: "Do you sell or ship items?",
    a: "No. Biggy Index is read-only and sends you back to Little Biggy to complete your order.",
  },
  {
    q: "Where does the data come from?",
    a: "The index fetches public Little Biggy data, normalising categories, pricing summaries, shipping info, reviews and images.",
  },
  {
    q: "How often is it refreshed?",
    a: "There are 3 components that refresh at different intervals. The main indexer runs every 15 minutes. The item and seller crawlers run every 4 hours, at separate times to be mindful of Little Biggy's server.",
  },
  {
    q: "What does First Seen or Updated on items mean?",
    a: "First seen/created means that it's the first time the item was indexed by the crawler. This can include items which were on LB before the indexer existed. Updated means that the item was edited by the seller, or that the crawler detected a change (e.g. price, variants, description).",
  },
  {
    q: "What are endorsements?",
    a: "Community votes that highlight popular items without tracking you.",
  },
];

const BITCOIN_FAQS: FaqItem[] = [
  {
    q: "What payments does Little Biggy accept?",
    a: "Only Bitcoin - no cards, bank transfers or other cryptocurrencies.",
  },
  {
    q: "How do I buy Bitcoin in the UK?",
    a: "Most buyers use Revolut, Monzo, Kraken, or Coinbase. Top up in pounds, purchase the amount of BTC shown at checkout, and allow a few pounds for network or exchanging fees.",
  },
  {
    q: "Do I need my own wallet first?",
    a: "You can pay straight from the exchange, but many people move BTC into a private wallet like Cake Wallet or Trust Wallet for extra privacy. UK exchanges are required to ask where you're sending coins \u2014 so some buyers prefer routing via a personal wallet.",
  },
  {
    q: "How does Transaxe escrow protect me?",
    a: "Your payment goes to a Transaxe escrow address. Sellers have about 80 hours to mark orders as shipped or the funds auto-refund. Disputes open after nine days if needed.",
  },
  {
    q: "Any tips to avoid mistakes?",
    a: "Copy-paste the BTC amount and address, add a buffer for fees, and keep screenshots until your parcel arrives. The blockchain cannot undo typos.",
  },
  {
    q: "Why not just use clearnet shops?",
    a: "Competition on Little Biggy keeps quality high and prices fair. Clearnet resellers often charge heavy markups or ship questionable stock.",
  },
  {
    q: "What about UK legality?",
    a: "Cannabis laws still apply. You are responsible for staying within local regulations and verifying every detail on Little Biggy.",
  },
];

const FAQ_DATA: Record<Tab, FaqItem[]> = {
  about: ABOUT_FAQS,
  bitcoin: BITCOIN_FAQS,
};

export function FaqSection() {
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [expanded, setExpanded] = useState<number | null>(null);

  const faqs = FAQ_DATA[activeTab];

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
            Frequently asked
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            FAQs for first-time visitors
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
                {tab.label}
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
                key={`${activeTab}-${i}`}
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
