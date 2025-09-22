"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
// npm install lucide-react
import { ChevronDown, Info, Lock, ShoppingBag, WalletMinimal, ShieldCheck } from "lucide-react";
import cn from "@/app/cn";
import Link from "next/link";

const accordionVariants = {
  open: { height: "auto", opacity: 1, overflow: "visible" },
  collapsed: { height: 0, opacity: 0, overflow: "hidden" },
};

function TooltipTerm({ term, definition, placement: preferredPlacement = "auto" }) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();
  const containerRef = useRef(null);
  const [placement, setPlacement] = useState("bottom");

  const evaluatePlacement = () => {
    if (preferredPlacement !== "auto") {
      setPlacement(preferredPlacement);
      return;
    }
    if (typeof window === "undefined" || !containerRef.current) {
      setPlacement("bottom");
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = 140;
    let nextPlacement = "bottom";
    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      nextPlacement = "top";
    } else if (spaceBelow >= estimatedHeight) {
      nextPlacement = "bottom";
    } else if (spaceAbove >= estimatedHeight) {
      nextPlacement = "top";
    } else if (spaceAbove > spaceBelow) {
      nextPlacement = "top";
    }
    setPlacement(nextPlacement);
  };

  const showTooltip = () => {
    evaluatePlacement();
    setIsOpen(true);
  };

  const hideTooltip = () => {
    setIsOpen(false);
  };

  const resolvedPlacement = preferredPlacement === "auto" ? placement : preferredPlacement;
  const placementClass = resolvedPlacement === "top" ? "bottom-full -translate-y-3" : "top-full translate-y-3";
  const offsetY = resolvedPlacement === "top" ? -4 : 4;

  return (
    <span ref={containerRef} className="relative inline-flex items-center gap-1">
      <span className="font-medium text-slate-900 dark:text-white">{term}</span>
      <button
        type="button"
        aria-label={`What does ${term} mean?`}
        aria-describedby={isOpen ? tooltipId : undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/50 bg-white text-emerald-600 transition hover:bg-emerald-50 dark:border-white/20 dark:bg-white/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
      >
        <Info className="h-3 w-3" aria-hidden />
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.span
            key={tooltipId}
            id={tooltipId}
            role="tooltip"
            initial={{ opacity: 0, y: offsetY }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: offsetY }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{ transformOrigin: resolvedPlacement === "top" ? "bottom center" : "top center" }}
            className={cn(
              "absolute left-1/2 z-30 w-56 -translate-x-1/2 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur",
              placementClass
            )}
          >
            {definition}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function StepContentWrapper({ children }) {
  return <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-white/70">{children}</div>;
}

function EmphasisCard({ icon, title, description }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:border-white/10 dark:bg-white/5 dark:text-emerald-200">
      <div className="mt-0.5 text-emerald-500 dark:text-emerald-300" aria-hidden>
        {icon}
      </div>
      <div>
        <p className="font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">{title}</p>
        <p className="mt-1 leading-snug text-emerald-700/90 dark:text-emerald-100/90">{description}</p>
      </div>
    </div>
  );
}

export default function QuickStartSection() {
  const steps = useMemo(
    () => [
      {
        id: "step-1",
        title: "Get Some Bitcoin",
        emoji: "🪙",
        summary: "Pick up a little Bitcoin so you can check out.",
        highlight: WalletMinimal,
        renderContent: () => (
          <StepContentWrapper>
            <p>
              Think of Bitcoin as the special currency Littlebiggy accepts. Buy a small amount now so you are ready when you find something you like.
            </p>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Easiest way</p>
              <p>
                Apps you may already use, such as Revolut or Monzo, let you purchase Bitcoin inside the banking app in a few taps.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Other popular options</p>
              <p>
                A crypto <TooltipTerm term="Exchange" definition="A website or app where you can buy and sell digital currencies using regular money." placement="top" /> such as Coinbase or Kraken works just as well. They operate a bit like an online currency bureau.
              </p>
            </div>
            <EmphasisCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Pro tip"
              description="Buy a few pounds more than you need and round up. That extra buffer covers network fees."
            />
          </StepContentWrapper>
        ),
      },
      {
        id: "step-2",
        title: "Find Your Items",
        emoji: "🛍️",
        summary: "Browse the littlebiggy catalogue like it were ebay",
        highlight: ShoppingBag,
        renderContent: () => (
          <StepContentWrapper>
            <p>
              Find the items you want to buy, through littlebiggy itself, or through the index. There's a large selection, so be sure to give it a browse.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Click the <strong>Browse Items</strong> button below to start browsing.</li>
              <li>Check product descriptions and reviews to spot trusted sellers. If unsure, Google the seller's name or look on <a href="https://www.reddit.com/r/LittleBiggy/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline decoration-dotted underline-offset-2 transition hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200">
                  Reddit
                </a></li>
              <li>When ready, add what you want to your cart and enter your delivery details just like any other online store.</li>
            </ul>
          </StepContentWrapper>
        ),
      },
      {
        id: "step-3",
        title: "Checkout & Send Your Bitcoin",
        emoji: "✅",
        summary: "Copy the details, then send the payment from your phone or laptop.",
        highlight: WalletMinimal,
        renderContent: () => (
          <StepContentWrapper>
            <p>
              When you check out, Littlebiggy shows a private order page with everything you need to pay safely—whether you are copying the details on one device or moving between phone and desktop.
            </p>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Copy the two checkout details</p>
              <ul className="list-disc space-y-2 pl-5 mt-1">
                <li>
                  <strong>The exact BTC amount:</strong> it looks like 0.00123456. Copy it exactly so you do not underpay.
                </li>
                <li>
                  <strong>The Bitcoin address:</strong> a long string such as bc1q...—think of it as the account number for this order.
                </li>
              </ul>
              {/* <p className="text-sm text-slate-500 dark:text-white/65">Tip: paste them into a private note or message to yourself if you are hopping between devices.</p> */}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Send the payment</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Open the app or exchange you used to buy Bitcoin (Revolut, Coinbase, Monzo, Kraken, etc.).</li>
                <li>Choose the option to send or withdraw Bitcoin.</li>
                <li>Paste the Bitcoin address into the recipient field and the exact BTC amount into the amount field.</li>
                <li>Confirm the transfer—network confirmations usually land within a few minutes and your order page will update automatically.</li>
              </ol>
            </div>
            <div className="rounded-2xl bg-slate-100/80 p-4 text-sm text-slate-700 dark:bg-white/10 dark:text-white/75">
              <p className="font-semibold text-slate-900 dark:text-white">Want extra privacy?</p>
              <p className="mt-1">
                You can move the coins to your own <TooltipTerm term="Private wallet" definition="An app you control that stores your Bitcoin without relying on a bank or exchange." placement="top" /> first—
                <a href="https://cakewallet.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline decoration-dotted underline-offset-2 transition hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200">
                  Cake Wallet
                </a>
                ,
                <a href="https://trustwallet.com/" target="_blank" rel="noopener noreferrer" className="ml-1 text-emerald-600 underline decoration-dotted underline-offset-2 transition hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200">
                  Trust Wallet
                </a>
                , and similar apps—then forward the exact amount to Littlebiggy. That extra hop keeps exchanges from seeing where you spend your Bitcoin.
              </p>
            </div>
          </StepContentWrapper>
        ),
      },
      {
        id: "step-4",
        title: "Your Funds Are Safe (Escrow)",
        emoji: "🔐",
        summary: "Transaxe holds the money until your order arrives.",
        highlight: Lock,
        renderContent: () => (
          <StepContentWrapper>
            <p>
              You are not paying the seller directly. Instead, your Bitcoin lands with Transaxe, a trusted third party that provides <TooltipTerm term="Escrow" definition="A neutral service that holds funds and only releases them when both sides are happy." placement="top" /> protection.
            </p>
            <p>
              Transaxe only releases the money once the dispute window closes. If anything feels off or if there's an issue, contact the seller, otherwise raise a dispute from your order page.
            </p>
            <EmphasisCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Peace of mind"
              description="Escrow means the seller never touches your funds until the item is shipped and received. It is the safeguard that keeps Littlebiggy honest."
            />
          </StepContentWrapper>
        ),
      },
      {
        id: "step-5",
        title: "Wait for the Postie",
        emoji: "📮",
        summary: "Relax while it makes its way to you.",
        renderContent: () => (
          <StepContentWrapper>
            <p>
              Sellers usually mark orders as shipped within one business day, but check their manifestos for their posting times. After that it is a waiting game just like any other delivery.
            </p>
            <p>
              If the parcel takes longer than expected, contact the seller first—they may provide a tracking code. As a last resort, you can open a dispute from your order page while Escrow is still holding the funds.
            </p>
          </StepContentWrapper>
        ),
      },
    ],
    []
  );

  const [openStepId, setOpenStepId] = useState(steps[0]?.id ?? null);

  return (
    <section id="quick-start" className="relative overflow-hidden bg-white py-20 transition-colors duration-300 dark:bg-slate-950/70">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-500/10 to-transparent dark:from-emerald-500/15" aria-hidden />
      <div className="relative mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:border-white/10 dark:bg-white/10 dark:text-emerald-200">
            How it works
          </span>
          <h2 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
            Buying on Littlebiggy, a step-by-step guide
          </h2>
          <p className="mt-3 text-base text-slate-600 dark:text-white/70">
            Looking to buy cannabis online in the UK? Follow the steps below to get started.
          </p>
        </div>

        <div className="mt-16 space-y-4">
          {steps.map((step, index) => {
            const isOpen = openStepId === step.id;
            const contentId = `${step.id}-content`;
            const buttonId = `${step.id}-trigger`;
            const HighlightIcon = step.highlight;
            return (
              <motion.article
                key={step.id}
                layout
                transition={{ duration: 0.24, ease: [0.25, 0.8, 0.25, 1] }}
                className={cn(
                  "rounded-3xl border border-slate-200/70 bg-white/90 shadow-sm shadow-emerald-500/10 backdrop-blur transition-colors duration-200",
                  "dark:border-white/10 dark:bg-white/5 dark:shadow-black/30"
                )}
              >
                <button
                  id={buttonId}
                  type="button"
                  aria-controls={contentId}
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpenStepId((current) => (current === step.id ? null : step.id));
                  }}
                  className="flex w-full items-center gap-4 rounded-3xl px-6 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                >
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">{step.emoji}</div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
                      Step {index + 1}
                      {step.optional ? <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-200">Optional</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {step.title}
                      {HighlightIcon ? (
                        <span className="text-emerald-500 dark:text-emerald-300" aria-hidden>
                          <HighlightIcon className="h-5 w-5" />
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-white/60">{step.summary}</p>
                  </div>
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 transition-transform duration-200 dark:border-white/10 dark:bg-white/10 dark:text-emerald-200",
                      isOpen ? "rotate-180" : ""
                    )}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      key={contentId}
                      id={contentId}
                      aria-labelledby={buttonId}
                      initial="collapsed"
                      animate="open"
                      exit="collapsed"
                      variants={accordionVariants}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <div className="px-6 pb-6">
                        {step.renderContent()}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </div>
        <div className="mt-14 flex justify-center gap-4">
          <Link
            href="#faq"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400/60 hover:text-emerald-600 dark:border-white/20 dark:bg-white/5 dark:text-white/80 dark:hover:border-emerald-400/60 dark:hover:text-white"
          >
            FAQ
            <span aria-hidden>?</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:-translate-y-0.5 hover:bg-emerald-400"
          >
            Browse items
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}


