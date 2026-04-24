"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

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
          <p className="font-medium text-foreground mb-1">
            Other popular options
          </p>
          <p>
            A crypto exchange such as Coinbase or Kraken works just as well.
            They operate a bit like an online currency bureau.
          </p>
        </div>
        <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
          <span className="font-medium text-primary">Pro tip:</span> Buy a few
          pounds more than you need and round up. That extra buffer covers
          network fees or crypto volatility.
        </div>
        <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
          <span className="font-medium text-primary">
            Want to skip the exchange?
          </span>{" "}
          Peer-to-peer platforms such as{" "}
          <a
            href="https://bisq.network/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            Bisq
          </a>{" "}
          or{" "}
          <a
            href="https://robosats.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            RoboSats
          </a>{" "}
          let you buy Bitcoin directly from another person — no exchange
          account, no KYC paperwork. It's more hands-on, but the coins land
          straight in a wallet you control.
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
          Find items you want to buy — on Little Biggy itself or via the index.
          There's a huge selection, so have a good browse.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Click the <strong>Browse Items</strong> button below to start
            browsing.
          </li>
          <li>
            Check product descriptions and reviews to spot trusted sellers. If
            unsure, Google the seller's name or look on{" "}
            <a
              href="https://www.reddit.com/r/LittleBiggy/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              Reddit
            </a>
            .
          </li>
          <li>
            When ready, add what you want to your cart and enter your delivery
            details just like any other online store.
          </li>
        </ul>
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
          At checkout, Little Biggy shows a private order page with everything
          you need to pay safely, whether you're on one device or switching
          between phone and desktop.
        </p>
        <div>
          <p className="font-medium text-foreground mb-1">
            Copy the two checkout details
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              The exact BTC amount: it looks like{" "}
              <code className="text-xs">0.00123456</code>. Copy it exactly so
              you do not underpay.
            </li>
            <li>
              The Bitcoin address: a long string such as{" "}
              <code className="text-xs">bc1q...</code> - think of it as the
              account number for this order.
            </li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-foreground mb-1">Send the payment</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Open the app or exchange you used to buy Bitcoin (Revolut,
              Coinbase, Monzo, Kraken, etc.).
            </li>
            <li>Choose the option to send or withdraw Bitcoin.</li>
            <li>
              Paste the Bitcoin address into the recipient field and the exact
              BTC amount into the amount field.
            </li>
            <li>
              Confirm the transfer. Network confirmations usually land within a
              few minutes and your order page will update automatically.
            </li>
          </ol>
        </div>
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
        <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
          <p className="font-medium text-primary mb-1">Peace of mind</p>
          <p>
            Escrow means the seller never touches your funds until the item is
            shipped and received. It is the safeguard that keeps Little Biggy
            honest.
          </p>
        </div>
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
          most issues get resolved quickly. Only open a dispute as a last
          resort.
        </p>
      </div>
    ),
  },
];

export function QuickStartGuide() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="py-20 px-4 bg-surface">
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
                className="rounded-2xl border border-border bg-card overflow-hidden"
              >
                {/* Clickable header */}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : i)}
                  className="w-full flex items-center gap-4 p-5 text-left transition-colors hover:bg-card-hover"
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
                      <div className="px-5 pb-5 pt-0 text-sm text-muted leading-relaxed border-t border-border">
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
