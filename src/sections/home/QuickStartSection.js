"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
// npm install lucide-react
import { ChevronDown, Info, Lock, ShoppingBag, WalletMinimal, ShieldCheck } from "lucide-react";
import cn from "@/app/cn";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLocale } from "@/providers/IntlProvider";

const accordionVariants = {
  open: { height: "auto", opacity: 1, overflow: "visible" },
  collapsed: { height: 0, opacity: 0, overflow: "hidden" },
};

function TooltipTerm({ term, definition, placement: preferredPlacement = "auto", ariaLabel }) {
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
        aria-label={ariaLabel || `What does ${term} mean?`}
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
    <div className="mt-3 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:border-white/10 dark:bg-white/5 dark:text-emerald-200">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-200" aria-hidden>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function QuickStartSection() {
  const tHome = useTranslations("Home");
  const localeCtx = useLocale();
  const lc = (localeCtx?.locale || "en-GB").toLowerCase();
  const listPrefix = lc.startsWith("de") ? "/de" : lc.startsWith("fr") ? "/fr" : lc.startsWith("it") ? "/it" : lc.startsWith("pt") ? "/pt" : "";

  const steps = useMemo(
    () => [
      {
        id: "step-1",
        emoji: "🪙",
        title: tHome("quickStart.steps.1.title"),
        summary: tHome("quickStart.steps.1.summary"),
        highlight: WalletMinimal,
        renderContent: () => (
          <StepContentWrapper>
            <p>{tHome("quickStart.steps.1.p1")}</p>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:border-white/10 dark:bg-white/5 dark:text-emerald-200">
              <p className="font-semibold text-slate-900 dark:text-white">{tHome("quickStart.steps.1.easiestTitle")}</p>
              <p>{tHome("quickStart.steps.1.easiestDesc")}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{tHome("quickStart.steps.1.otherTitle")}</p>
              <p>
                {tHome("quickStart.steps.1.otherDescBefore")} {" "}
                <TooltipTerm term={tHome("quickStart.terms.exchange.term")} definition={tHome("quickStart.terms.exchange.def")} placement="top" /> {" "}
                {tHome("quickStart.steps.1.otherDescAfter")}
              </p>
            </div>
            <EmphasisCard icon={<ShieldCheck className="h-4 w-4" />} title={tHome("quickStart.steps.1.proTipTitle")} description={tHome("quickStart.steps.1.proTipDesc")} />
          </StepContentWrapper>
        ),
      },
      {
        id: "step-2",
        emoji: "🔐",
        title: tHome("quickStart.steps.2.title"),
        summary: tHome("quickStart.steps.2.summary"),
        highlight: Lock,
        renderContent: () => {
          // Resolve bullets using the explicit singular keys present in all locales.
          const b0 = tHome.rich("quickStart.steps.2.bullets0", {
            strong: (chunks) => <strong>{chunks}</strong>,
          });
          const b1 = tHome.rich("quickStart.steps.2.bullets1", {
            reddit: (chunks) => (
              <a
                href="https://www.reddit.com/r/LittleBiggy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 underline decoration-dotted underline-offset-2 transition hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                {chunks}
              </a>
            ),
          });
          const b2 = tHome("quickStart.steps.2.bullets2");

          return (
            <StepContentWrapper>
              <p>{tHome("quickStart.steps.2.p1")}</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>{b0}</li>
                <li>{b1}</li>
                <li>{b2}</li>
              </ul>
              <EmphasisCard icon={<ShieldCheck className="h-4 w-4" />} title={tHome("quickStart.steps.2.proTipTitle")} description={tHome("quickStart.steps.2.proTipDesc")} />
            </StepContentWrapper>
          );
        },
      },
      {
        id: "step-3",
        emoji: "🛒",
        title: tHome("quickStart.steps.3.title"),
        summary: tHome("quickStart.steps.3.summary"),
        highlight: ShoppingBag,
        renderContent: () => (
          <StepContentWrapper>
            <p>{tHome("quickStart.steps.3.pIntro")}</p>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{tHome("quickStart.steps.3.copyTitle")}</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>{tHome("quickStart.steps.3.copyBullets.0")}</li>
                <li>{tHome("quickStart.steps.3.copyBullets.1")}</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{tHome("quickStart.steps.3.sendTitle")}</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>{tHome("quickStart.steps.3.sendSteps.0")}</li>
                <li>{tHome("quickStart.steps.3.sendSteps.1")}</li>
                <li>{tHome("quickStart.steps.3.sendSteps.2")}</li>
                <li>{tHome("quickStart.steps.3.sendSteps.3")}</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{tHome("quickStart.steps.3.privacyTitle")}</p>
              <p>
                {tHome("quickStart.steps.3.privacy1")} {" "}
                <TooltipTerm term={tHome("quickStart.terms.privateWallet.term")} definition={tHome("quickStart.terms.privateWallet.def")} placement="top" /> {" "}
                {tHome("quickStart.steps.3.privacy2")} {" "}
                <a href="https://cakewallet.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline decoration-dotted underline-offset-2 transition hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200">
                  Cake Wallet
                </a>
                <span>, </span>
                <a href="https://trustwallet.com/" target="_blank" rel="noopener noreferrer" className="ml-1 text-emerald-600 underline decoration-dotted underline-offset-2 transition hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200">
                  Trust Wallet
                </a>
                <span>.</span> {tHome("quickStart.steps.3.privacy3")}
              </p>
            </div>
          </StepContentWrapper>
        ),
      },
      {
        id: "step-4",
        emoji: "✅",
        title: tHome("quickStart.steps.4.title"),
        summary: tHome("quickStart.steps.4.summary"),
        highlight: WalletMinimal,
        renderContent: () => (
          <StepContentWrapper>
            <ol className="list-decimal space-y-2 pl-5">
              <li>{tHome("quickStart.steps.4.ol.0", { default: "Choose the option to send or withdraw Bitcoin." })}</li>
              <li>{tHome("quickStart.steps.4.ol.1", { default: "Paste the Bitcoin address into the recipient field and the exact BTC amount into the amount field." })}</li>
              <li>{tHome("quickStart.steps.4.ol.2", { default: "Confirm the transfer—network confirmations usually land within a few minutes and your order page will update automatically." })}</li>
            </ol>
            <p>
              {tHome("quickStart.steps.4.p1_before")} {" "}
              <TooltipTerm term={tHome("quickStart.terms.escrow.term")} definition={tHome("quickStart.terms.escrow.def")} placement="top" /> {" "}
              {tHome("quickStart.steps.4.p1_after")}
            </p>
            <p>{tHome("quickStart.steps.4.p2")}</p>
            <EmphasisCard icon={<ShieldCheck className="h-4 w-4" />} title={tHome("quickStart.steps.4.cardTitle")} description={tHome("quickStart.steps.4.cardDesc")} />
          </StepContentWrapper>
        ),
      },
      {
        id: "step-5",
        emoji: "📮",
        title: tHome("quickStart.steps.5.title"),
        summary: tHome("quickStart.steps.5.summary"),
        highlight: ShieldCheck,
        renderContent: () => (
          <StepContentWrapper>
            <p>{tHome("quickStart.steps.5.p1")}</p>
            <p>{tHome("quickStart.steps.5.p2")}</p>
          </StepContentWrapper>
        ),
      },
    ],
    [tHome, lc]
  );

  const [openStepId, setOpenStepId] = useState(steps[0]?.id ?? null);

  return (
    <section id="quick-start" className="relative overflow-hidden bg-white py-20 transition-colors duration-300 dark:bg-slate-950/70">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-500/10 to-transparent dark:from-emerald-500/15" aria-hidden />
      <div className="relative mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:border-white/10 dark:bg-white/10 dark:text-emerald-200">
            {tHome("quickStart.badge")}
          </span>
          <h2 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">{tHome("quickStart.title")}</h2>
          <p className="mt-3 text-base text-slate-600 dark:text-white/70">{tHome("quickStart.subtitle")}</p>
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
                  onClick={() => setOpenStepId((current) => (current === step.id ? null : step.id))}
                  className="flex w-full items-center gap-4 rounded-3xl px-6 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                >
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">{step.emoji}</div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
                      {tHome("quickStart.stepLabel", { num: index + 1 })}
                      {step.optional ? (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-200">{tHome("quickStart.optional")}</span>
                      ) : null}
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
                      <div className="px-6 pb-6">{step.renderContent()}</div>
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
            {tHome("quickStart.labels.faq")} <span aria-hidden>?</span>
          </Link>
          <Link href={`${listPrefix || "/"}`} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:-translate-y-0.5 hover:bg-emerald-400">
            {tHome("quickStart.labels.browseItems")} <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

