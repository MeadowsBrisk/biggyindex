"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fadeInUp } from "@/sections/home/motionPresets";
import ChevronDown from "@/components/icons/ChevronDown";

const aboutQuestions = [
  {
    question: "What is the Biggy Index?",
    answer:
      "The Biggy Index provides an easier way to browse the LittleBiggy marketplace, with item categorisation, additional sorting options, and other handy tools tailored for UK shoppers.",
  },
  {
    question: "Do you sell or ship items?",
    answer: "No. Biggy Index is read-only and sends you back to LittleBiggy to complete your order.",
  },
  {
    question: "Where does the data come from?",
    answer: "The index fetches public LittleBiggy data, normalising categories, pricing summaries, shipping info, reviews and images.",
  },
  {
    question: "How often is it refreshed?",
    answer: "There are 3 components that refresh at different intervals. The main indexer runs every 15 minutes. The item and seller crawlers run every 4 hours, at separate times to be mindful of LittleBiggy's server.",
  },
    {
    question: "What does First Seen or Updated on items mean?",
    answer:
      "First seen/created means that it's the first time the item was indexed by the crawler. This can include items which were on LB before the indexer existed. Updated means that the item was edited by the seller, or that the crawler detected a change (e.g. price, variants, description).",
  },
  {
    question: "What are endorsements?",
    answer: "Community votes stored via Netlify Blobs highlight popular items without tracking you.",
  },
];

const cryptoQuestions = [
  {
    question: "What payments does LittleBiggy accept?",
    answer: "Only Bitcoin - no cards, bank transfers or other cryptocurrencies.",
  },
  {
    question: "How do I buy Bitcoin in the UK?",
    answer:
      "Most buyers use Revolut, Monzo, Kraken, or Coinbase. Top up in pounds, purchase the amount of BTC shown at checkout, and allow a few pounds for network or exchanging fees.",
  },
  {
    question: "Do I need my own wallet first?",
    answer:
      "You can pay straight from the exchange, but many move BTC into Cake Wallet, Trust Wallet, or similar for extra control or privacy before sending. By law, exchanges need to ask you who you're sending the coins to - so some people prefer buying on exchanges and storing their coins in a private wallet for making purchases.",
  },
  {
    question: "How does Transaxe escrow protect me?",
    answer:
      "Your payment goes to a Transaxe escrow address. Sellers have about 80 hours to mark orders as shipped or the funds auto-refund. Disputes open after nine days if needed.",
  },
  {
    question: "Any tips to avoid mistakes?",
    answer:
      "Copy-paste the BTC amount and address, add a buffer for fees, and keep screenshots until your parcel arrives. The blockchain cannot undo typos.",
  },
    {
    question: "Why not just use clearnet shops?",
    answer:
      "Competition on LittleBiggy keeps quality high and prices honest, whereas clearnet resellers often mark up heavily or ship questionable stock.",
  },
  {
    question: "What about UK legality?",
    answer: "Cannabis laws still apply. You are responsible for staying within local regulations and verifying every detail on LittleBiggy.",
  },
];

const tabs = [
  { key: "about", label: "About Biggy Index", questions: aboutQuestions },
  { key: "crypto", label: "LittleBiggy & Bitcoin", questions: cryptoQuestions },
];

function AccordionItem({ question, answer, isOpen, onToggle }) {
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

function Accordion({ questions }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      {questions.map((item, index) => (
        <AccordionItem
          key={item.question}
          question={item.question}
          answer={item.answer}
          isOpen={openIndex === index}
          onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
        />
      ))}
    </div>
  );
}

export default function FaqSection() {
  const [activeTab, setActiveTab] = useState(tabs[0].key);
  const currentTab = useMemo(() => tabs.find((tab) => tab.key === activeTab) ?? tabs[0], [activeTab]);

  return (
    <section className="relative overflow-hidden bg-slate-100 py-20 transition-colors duration-300 dark:bg-slate-950" id="faq">
      <div className="absolute inset-0" aria-hidden>
        <div className="pointer-events-none absolute left-1/2 top-10 h-48 w-48 -translate-x-1/2 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
        <div className="pointer-events-none absolute right-10 bottom-0 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-5xl px-6">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-white/60">Frequently asked</span>
          <h2 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">FAQs for first-time Biggy explorers</h2>
          <p className="mt-3 text-base text-slate-600 dark:text-white/70">
            Two quick panels: one about how Biggy Index works, another covering LittleBiggy payments and crypto basics.
          </p>
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
            {...fadeInUp({ distance: 12, duration: 0.25, viewportAmount: 1, once: false })}
          >
              <Accordion questions={currentTab.questions} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

