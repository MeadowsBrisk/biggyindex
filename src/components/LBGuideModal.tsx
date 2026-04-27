"use client";

import { useAtom, useSetAtom } from "jotai";
import {
  Bitcoin,
  BookOpenText,
  ExternalLink,
  Globe2,
  ShoppingCart,
  UserRound,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { getEmbassyUrl } from "@/lib/market/embassyLinks";
import { trackOutboundClick } from "@/lib/tracking/outbound";
import {
  lbGuideModalOpenAtom,
  lbGuidePendingLinkAtom,
  lbGuideSeenAtom,
} from "@/store/atoms";

const STEPS = [
  { key: "country", Icon: Globe2 },
  { key: "buy", Icon: ShoppingCart },
  { key: "account", Icon: UserRound },
  { key: "checkout", Icon: Bitcoin },
] as const;

export function LBGuideModal() {
  const t = useTranslations("lbGuide");
  const locale = useLocale();
  const [isOpen, setIsOpen] = useAtom(lbGuideModalOpenAtom);
  const [pendingLink, setPendingLink] = useAtom(lbGuidePendingLinkAtom);
  const setSeen = useSetAtom(lbGuideSeenAtom);
  const [dontShow, setDontShow] = useState(false);
  const embassyUrl = getEmbassyUrl(locale);

  useBodyScrollLock(isOpen);

  const close = useCallback(() => {
    setIsOpen(false);
    setPendingLink(null);
    setDontShow(false);
  }, [setIsOpen, setPendingLink]);

  const continueToLittleBiggy = useCallback(() => {
    if (dontShow) setSeen(true);

    if (pendingLink) {
      trackOutboundClick(pendingLink.event);
      window.open(pendingLink.url, "_blank", "noopener,noreferrer");
    }

    close();
  }, [close, dontShow, pendingLink, setSeen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop modal-backdrop--stacked"
      style={{ zIndex: 220 }}
    >
      <button
        type="button"
        aria-label={t("close")}
        className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="modal-panel modal-panel--lg z-10"
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("close")}
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <X size={16} />
        </button>

        <div className="pr-8">
          <h2 className="text-xl font-bold text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>

        <div className="mt-5 grid gap-3">
          {STEPS.map(({ key, Icon }) => (
            <div
              key={key}
              className="flex gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">
                  {t(`steps.${key}.title`)}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {t(`steps.${key}.text`)}
                </p>
              </div>
            </div>
          ))}

          {embassyUrl && (
            <a
              href={embassyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 rounded-lg border border-primary/25 bg-primary/8 p-3 text-left transition-colors hover:border-primary/45 hover:bg-primary/12"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <BookOpenText size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {t("guideLink.title")}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  {t("guideLink.text")}
                </span>
              </span>
              <ExternalLink
                size={14}
                className="mt-1 shrink-0 text-muted transition-colors group-hover:text-primary"
              />
            </a>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(event) => setDontShow(event.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            <span>{t("dontShowAgain")}</span>
          </label>

          <button
            type="button"
            onClick={continueToLittleBiggy}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
          >
            {t("continueBtn")}
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
