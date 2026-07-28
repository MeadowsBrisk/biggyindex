import { ExternalLink, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { VERIFY_LINKS } from "@/lib/verify-links";

/**
 * Anti-phishing / outage-escape card for /littlebiggy-status.
 *
 * Variant A "card-with-rows": ONE bordered container holding BORDERLESS rows.
 * The rows are the same primitive as the desktop Verify popover and the mobile
 * drawer, in wrapping mode (`items-start`, icon `mt-0.5`, no `truncate`) —
 * security copy must never be clipped. A 3-across grid of bordered tiles was
 * rejected: nested borders, and it would make the same four links read as a
 * third species.
 *
 * Link labels/descriptions come from the `header.verify` namespace, so this
 * card ships in all nine authored locales with zero new copy.
 */

interface Props {
  locale: string;
  /** `verify.heading` when LB is up, `verify.headingDown` during an outage. */
  headingKey: "heading" | "headingDown";
  className?: string;
}

export async function VerifyCard({ locale, headingKey, className }: Props) {
  const t = await getTranslations({
    locale,
    namespace: "littleBiggyStatus.verify",
  });
  const tv = await getTranslations({ locale, namespace: "header.verify" });

  // We ARE the status page — the self-link would be a no-op. The other three
  // surfaces keep all four entries.
  const links = VERIFY_LINKS.filter((l) => l.key !== "status");

  return (
    <section
      className={`${className ?? ""} rounded-2xl border border-[var(--border)] bg-surface p-2 sm:p-3`}
    >
      {/* `px-3` lines the heading up with the row labels below it. */}
      <div className="px-3 pt-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck
            size={16}
            aria-hidden="true"
            className="shrink-0 text-primary"
          />
          {t(headingKey)}
        </h2>
        <p className="mt-1.5 text-sm text-muted leading-relaxed">{t("body")}</p>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {links.map(({ key, href, Icon }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${tv(`${key}.label`)} ${tv("opensInNewTab")}`}
            className="flex min-h-12 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <Icon
              size={18}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-muted"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-[15px] font-medium leading-5 text-foreground">
                  {tv(`${key}.label`)}
                </span>
                <ExternalLink
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-muted"
                />
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted">
                {tv(`${key}.description`)}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
