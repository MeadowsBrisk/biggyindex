"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface Step {
  emoji: string;
  title: string;
  summary: string;
  detail: React.ReactNode;
}

const STEPS: Step[] = [
  {
    emoji: "\uD83E\uDE99",
    title: "Get Some Bitcoin",
    summary: "Grab some Bitcoin so you're ready to check out.",
    detail: (
      <div className="space-y-3">
        <p>
          Little Biggy only accepts Bitcoin. You'll need to set up a way to buy
          some if you haven't already, so that you're ready to start ordering
          items.
        </p>
        <div>
          <p className="font-medium text-foreground mb-1">Easiest way</p>
          <p>
            Apps you may already use, such as Revolut or Monzo, let you purchase
            Bitcoin inside the banking app in a few taps.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground mb-1">Other options</p>
          <p>
            A crypto exchange such as Coinbase or Kraken works just as well.
            They operate a bit like an online currency bureau.
          </p>
        </div>
        <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
          <span className="font-medium text-primary">Pro tip:</span> Buy a
          few pounds more than you need and round up. That extra buffer covers
          network fees or crypto volatility.
        </div>
      </div>
    ),
  },
  {
    emoji: "\uD83D\uDECD\uFE0F",
    title: "Find Your Items",
    summary: "Browse the Little Biggy catalogue like you would on eBay.",
    detail: (
      <div className="space-y-3">
        <p>
          Find items you want to buy - on Little Biggy itself or via the index.
          There's a huge selection, so have a good browse.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Click Browse Items</li>
          <li>Check descriptions and reviews for trusted sellers</li>
          <li>Add to cart and enter delivery details</li>
        </ul>
        <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
          <span className="font-medium text-primary">Pro tip:</span> Use
          filters and reviews to shortlist sellers; check their manifest for
          posting times.
        </div>
      </div>
    ),
  },
  {
    emoji: "\u2705",
    title: "Checkout & Send Your Bitcoin",
    summary:
      "Copy the details, then send the payment from your phone or laptop.",
    detail: (
      <div className="space-y-3">
        <p>
          Once you've added items to your cart and entered your delivery details,
          you'll be shown an order page with a Bitcoin amount and a wallet
          address.
        </p>
        <p>
          Copy the BTC amount and the address, open your Bitcoin wallet (Revolut,
          Monzo, Coinbase, etc.), and send the exact amount to that address.
          Double-check the address before sending.
        </p>
      </div>
    ),
  },
  {
    emoji: "\uD83D\uDD10",
    title: "Your Funds Are Safe (Escrow)",
    summary: "Transaxe holds the money until your order arrives.",
    detail: (
      <div className="space-y-3">
        <p>
          Your Bitcoin goes to Transaxe, Little Biggy's built-in escrow system.
          The seller can see the payment has arrived, but the funds are held
          securely.
        </p>
        <p>
          The money is only released to the seller once the dispute window
          closes. This protects you as a buyer - if something goes wrong, you
          can open a dispute before the window ends.
        </p>
      </div>
    ),
  },
  {
    emoji: "\uD83D\uDCEE",
    title: "Wait for the Postie",
    summary: "Relax while it makes its way to you.",
    detail: (
      <div className="space-y-3">
        <p>
          Sellers typically mark your order as shipped within one business day.
          Delivery times depend on the seller and your location, but most UK
          orders arrive within a few days.
        </p>
        <p>
          If your order is late, contact the seller through Little Biggy first -
          most issues get resolved quickly. Only open a dispute as a last resort.
        </p>
      </div>
    ),
  },
];

export function QuickStartGuide() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="py-20 px-4 bg-[var(--surface)]">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            How It Works
          </h2>
          <p className="text-muted max-w-lg mx-auto">
            New to Little Biggy? Here's a quick overview of the process from
            start to finish.
          </p>
        </motion.div>

        {/* Steps — vertical layout for clarity */}
        <div className="space-y-4 max-w-2xl mx-auto">
          {STEPS.map((step, i) => {
            const isExpanded = expanded === i;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
              >
                {/* Clickable header */}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : i)}
                  className="w-full flex items-center gap-4 p-5 text-left transition-colors hover:bg-[var(--card-hover)]"
                >
                  {/* Step number + emoji */}
                  <div className="relative shrink-0 w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xl">
                    {step.emoji}
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>

                  {/* Title + summary */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted leading-relaxed mt-0.5">
                      {step.summary}
                    </p>
                  </div>

                  {/* Chevron */}
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Expandable detail — inline, not absolute */}
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
                        <div className="pt-4">{step.detail}</div>
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
