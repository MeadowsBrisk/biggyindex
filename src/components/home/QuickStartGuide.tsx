"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface Step {
  emoji: string;
  title: string;
  summary: string;
  detail: React.ReactNode;
}

type Translate = (key: string) => string;

function buildSteps(t: Translate): Step[] {
  return [
    {
      emoji: "\uD83E\uDE99",
      title: t("steps.bitcoin.title"),
      summary: t("steps.bitcoin.summary"),
      detail: (
        <div className="space-y-3">
          <p>{t("steps.bitcoin.intro")}</p>
          <div>
            <p className="font-medium text-foreground mb-1">
              {t("steps.bitcoin.easiestWay.heading")}
            </p>
            <p>{t("steps.bitcoin.easiestWay.text")}</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">
              {t("steps.bitcoin.otherOptions.heading")}
            </p>
            <p>{t("steps.bitcoin.otherOptions.text")}</p>
          </div>
          <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
            <span className="font-medium text-primary">
              {t("steps.bitcoin.proTip.label")}
            </span>{" "}
            {t("steps.bitcoin.proTip.text")}
          </div>
          <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
            <span className="font-medium text-primary">
              {t("steps.bitcoin.peerToPeer.label")}
            </span>{" "}
            {t("steps.bitcoin.peerToPeer.beforeLinks")}{" "}
            <a
              href="https://bisq.network/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              Bisq
            </a>{" "}
            {t("steps.bitcoin.peerToPeer.betweenLinks")}{" "}
            <a
              href="https://learn.robosats.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              RoboSats
            </a>{" "}
            {t("steps.bitcoin.peerToPeer.afterLinks")}
          </div>
        </div>
      ),
    },
    {
      emoji: "\uD83D\uDECD\uFE0F",
      title: t("steps.browse.title"),
      summary: t("steps.browse.summary"),
      detail: (
        <div className="space-y-3">
          <p>{t("steps.browse.intro")}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              {t("steps.browse.startBefore")}{" "}
              <strong>{t("steps.browse.browseButton")}</strong>{" "}
              {t("steps.browse.startAfter")}
            </li>
            <li>
              {t("steps.browse.trustBefore")}{" "}
              <a
                href="https://www.reddit.com/r/LittleBiggy/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Reddit
              </a>
              {t("steps.browse.trustAfter")}
            </li>
            <li>{t("steps.browse.cart")}</li>
          </ul>
        </div>
      ),
    },
    {
      emoji: "\u2705",
      title: t("steps.checkout.title"),
      summary: t("steps.checkout.summary"),
      detail: (
        <div className="space-y-3">
          <p>{t("steps.checkout.intro")}</p>
          <div>
            <p className="font-medium text-foreground mb-1">
              {t("steps.checkout.copyHeading")}
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium text-foreground">
                  {t("steps.checkout.amountLabel")}
                </span>{" "}
                {t("steps.checkout.amountBefore")}{" "}
                <code className="text-xs">0.00123456</code>.{" "}
                {t("steps.checkout.amountAfter")}
              </li>
              <li>
                <span className="font-medium text-foreground">
                  {t("steps.checkout.addressLabel")}
                </span>{" "}
                {t("steps.checkout.addressBefore")}{" "}
                <code className="text-xs">bc1q...</code> -{" "}
                {t("steps.checkout.addressAfter")}
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">
              {t("steps.checkout.sendHeading")}
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>{t("steps.checkout.sendSteps.openApp")}</li>
              <li>{t("steps.checkout.sendSteps.chooseSend")}</li>
              <li>{t("steps.checkout.sendSteps.pasteDetails")}</li>
              <li>{t("steps.checkout.sendSteps.confirm")}</li>
            </ol>
          </div>
        </div>
      ),
    },
    {
      emoji: "\uD83D\uDD10",
      title: t("steps.escrow.title"),
      summary: t("steps.escrow.summary"),
      detail: (
        <div className="space-y-3">
          <p>{t("steps.escrow.intro")}</p>
          <p>{t("steps.escrow.release")}</p>
          <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
            <p className="font-medium text-primary mb-1">
              {t("steps.escrow.peaceHeading")}
            </p>
            <p>{t("steps.escrow.peaceText")}</p>
          </div>
        </div>
      ),
    },
    {
      emoji: "\uD83D\uDCEE",
      title: t("steps.delivery.title"),
      summary: t("steps.delivery.summary"),
      detail: (
        <div className="space-y-3">
          <p>{t("steps.delivery.intro")}</p>
          <p>{t("steps.delivery.late")}</p>
        </div>
      ),
    },
  ];
}

export function QuickStartGuide() {
  const t = useTranslations("home.quickStart");
  const [expanded, setExpanded] = useState<number | null>(null);
  const steps = buildSteps(t);

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
            {t("heading")}
          </h2>
          <p className="text-muted max-w-lg mx-auto">{t("subheading")}</p>
        </motion.div>

        {/* Steps — vertical layout for clarity */}
        <div className="space-y-4 max-w-2xl mx-auto">
          {steps.map((step, i) => {
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
