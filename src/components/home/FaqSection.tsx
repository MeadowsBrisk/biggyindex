"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";
import { VERIFY_LINKS } from "@/lib/verify-links";

interface FaqItem {
  id: string;
  q: string;
  a: string;
  /** Render the canonical Little Biggy links under the answer. */
  withVerifyLinks?: boolean;
}

/**
 * The one FAQ entry that carries the canonical-link list.
 *
 * WHY HERE: the homepage renders NO SiteHeader, so the Verify popover and the
 * mobile drawer section are both absent — the footer was the only route to
 * these links on the site's most-visited page. "How do I know I'm on the real
 * Little Biggy?" is also the question the links actually answer, so this beats
 * bolting a badge onto the hero (which is already dense, and whose brand green
 * would make an always-on status dot read as chrome).
 */
const VERIFY_LINKS_FAQ_KEY = "realSite";

type Tab = "about" | "bitcoin";

const TABS: { key: Tab; labelKey: string }[] = [
  { key: "about", labelKey: "tabs.about" },
  { key: "bitcoin", labelKey: "tabs.bitcoin" },
];

const FAQ_KEYS: Record<Tab, string[]> = {
  about: [
    "whatIs",
    "sellOrShip",
    "realSite",
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
  // Link labels come from the shared verify namespace so the wording stays in
  // sync with the header popover, drawer, footer and status page.
  const tVerify = useTranslations("header.verify");
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [expanded, setExpanded] = useState<number | null>(null);
  const header = useRevealOnScroll<HTMLDivElement>();
  const list = useRevealOnScroll<HTMLDivElement>();

  const faqs: FaqItem[] = FAQ_KEYS[activeTab].map((key) => ({
    id: key,
    q: t(`${activeTab}.items.${key}.q`),
    a: t(`${activeTab}.items.${key}.a`),
    withVerifyLinks: key === VERIFY_LINKS_FAQ_KEY,
  }));

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setExpanded(null);
  };

  return (
    <section className="py-20 px-4 bg-[var(--background)]">
      <div className="max-w-3xl mx-auto">
        <div
          ref={header.ref}
          data-revealed={header.revealed}
          className="reveal-fade text-center mb-12"
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
            {t("eyebrow")}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            {t("heading")}
          </h2>
        </div>

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

        {/* Accordion — items stagger in once the list scrolls into view */}
        <div className="space-y-3" ref={list.ref}>
          {faqs.map((faq, i) => {
            const isExpanded = expanded === i;
            return (
              <div
                key={`${activeTab}-${faq.id}`}
                data-revealed={list.revealed}
                style={
                  { "--reveal-delay": `${i * 40}ms` } as React.CSSProperties
                }
                className="reveal-fade rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
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

                {/* Stays mounted; grid-rows 0fr→1fr animates height without JS */}
                <div
                  className="collapse-rows"
                  data-open={isExpanded}
                  aria-hidden={!isExpanded}
                >
                  <div>
                    <div className="px-5 pb-5 pt-0 text-sm text-muted leading-relaxed border-t border-[var(--border)]">
                      <p className="pt-4">{faq.a}</p>

                      {/* Canonical links, from the single shared VERIFY_LINKS
                          list (same source as the header popover, the mobile
                          drawer, the footer and the status page — divergent
                          "which domain is real" lists are exactly the failure
                          this feature prevents).
                          mt-3 + gap-y-2: real, measurable gaps — this row sits
                          directly under a <p> and must not collapse into it. */}
                      {faq.withVerifyLinks && (
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                          {VERIFY_LINKS.map(({ key, href, external, Icon }) => {
                            const label = tVerify(`${key}.label`);
                            const className =
                              "inline-flex min-h-8 items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary";
                            return external ? (
                              <a
                                key={key}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`${label} ${tVerify("opensInNewTab")}`}
                                className={className}
                              >
                                <Icon
                                  size={14}
                                  aria-hidden="true"
                                  className="shrink-0 text-muted"
                                />
                                {label}
                                <ExternalLink
                                  size={12}
                                  aria-hidden="true"
                                  className="shrink-0 text-muted"
                                />
                              </a>
                            ) : (
                              <Link
                                key={key}
                                href={href}
                                prefetch={false}
                                className={className}
                              >
                                <Icon
                                  size={14}
                                  aria-hidden="true"
                                  className="shrink-0 text-muted"
                                />
                                {label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
