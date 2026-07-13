"use client";

import { Flag, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type {
  SellerCommunityFeedback,
  SellerCommunityReport,
} from "@/lib/types";

const FEEDBACK_API = process.env.NEXT_PUBLIC_SUGGESTIONS_API ?? "";
type FeedbackKind = "endorse" | "report";

function positiveCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export function SellerCommunityFeedbackBlock({
  feedback,
  indexSeller,
}: {
  feedback?: SellerCommunityFeedback | null;
  indexSeller?: {
    communityEndorsements?: number | null;
    communityReportCount?: number | null;
  };
}) {
  const t = useTranslations("seller.modal.feedback");
  const endorseCount = positiveCount(
    feedback?.endorseCount ?? indexSeller?.communityEndorsements,
  );
  const reportCount = positiveCount(
    feedback?.reportCount ?? indexSeller?.communityReportCount,
  );
  const hasComment = (
    report: SellerCommunityReport | null | undefined,
  ): report is SellerCommunityReport =>
    typeof report?.reason === "string" && report.reason.trim().length > 0;
  const reports = (feedback?.reports ?? []).filter(hasComment).slice(0, 5);
  const endorsements = (feedback?.endorsements ?? [])
    .filter(hasComment)
    .slice(0, 5);

  if (
    endorseCount === 0 &&
    reportCount === 0 &&
    reports.length === 0 &&
    endorsements.length === 0
  ) {
    return null;
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        {t("summaryHeading")}
      </h3>
      <div className="flex flex-wrap gap-2 text-xs">
        {endorseCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-200">
            <ThumbsUp size={12} />
            {t("endorsementCount", { count: endorseCount })}
          </span>
        )}
        {reportCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-200">
            <Flag size={12} />
            {t("reportCount", { count: reportCount })}
          </span>
        )}
      </div>

      {endorsements.length > 0 && (
        <div className="mt-3 space-y-2">
          {endorsements.map((endorsement) => (
            <div
              key={endorsement.id}
              className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted">
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp size={11} />
                  {t("endorsedNote")}
                </span>
                {positiveCount(endorsement.votes) > 1 && (
                  <span>
                    {t("similarEndorsements", {
                      count: positiveCount(endorsement.votes),
                    })}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-foreground">
                {endorsement.reason}
              </p>
            </div>
          ))}
        </div>
      )}

      {reports.length > 0 && (
        <div className="mt-3 space-y-2">
          {reports.map((report) => (
            <div
              key={report.id}
              className="rounded-md border border-border bg-surface p-3"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted">
                <span className="inline-flex items-center gap-1">
                  <Flag size={11} />
                  {t("reviewedNote")}
                </span>
                {positiveCount(report.votes) > 1 && (
                  <span>
                    {t("similarReports", {
                      count: positiveCount(report.votes),
                    })}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-foreground">
                {report.reason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SellerFeedbackActions({
  sellerId,
  sellerName,
}: {
  sellerId: string;
  sellerName: string;
}) {
  const t = useTranslations("seller.modal.feedback");
  const [submitted, setSubmitted] = useState<Record<FeedbackKind, boolean>>({
    endorse: false,
    report: false,
  });
  const [busy, setBusy] = useState<FeedbackKind | null>(null);
  // Which kind's optional-comment box is open (endorse and report share it)
  const [openKind, setOpenKind] = useState<FeedbackKind | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const reasonId = `seller-feedback-reason-${sellerId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSubmitted({
        endorse: !!localStorage.getItem(`bi:sf:endorse:${sellerId}`),
        report: !!localStorage.getItem(`bi:sf:report:${sellerId}`),
      });
    } catch {
      /* ignore */
    }
    setOpenKind(null);
    setReason("");
    setMessage(null);
  }, [sellerId]);

  const toggleKind = (kind: FeedbackKind) => {
    setOpenKind((current) => (current === kind ? null : kind));
    setReason("");
    setMessage(null);
  };

  const submit = useCallback(
    async (kind: FeedbackKind, reasonText?: string) => {
      if (!FEEDBACK_API) {
        setMessage(t("endpointMissing"));
        return;
      }
      setBusy(kind);
      setMessage(null);
      try {
        const res = await fetch(`${FEEDBACK_API}/seller-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sellerId,
            sellerName,
            kind,
            reason: reasonText || undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          duplicate?: boolean;
        };
        if (!res.ok) {
          if (res.status === 429) {
            setMessage(t("hourlyLimit"));
          } else {
            setMessage(data.error ?? `HTTP ${res.status}`);
          }
        } else {
          try {
            localStorage.setItem(
              `bi:sf:${kind}:${sellerId}`,
              String(Date.now()),
            );
          } catch {
            /* ignore */
          }
          setSubmitted((s) => ({ ...s, [kind]: true }));
          setMessage(data.duplicate ? t("duplicateThanks") : t("reviewThanks"));
          setOpenKind(null);
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : t("networkError"));
      } finally {
        setBusy(null);
      }
    },
    [sellerId, sellerName, t],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitted.endorse || busy !== null}
          onClick={() => toggleKind("endorse")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-emerald-500/40 hover:text-emerald-500 disabled:cursor-default disabled:opacity-60"
        >
          <ThumbsUp size={12} />
          {submitted.endorse
            ? t("endorsed")
            : busy === "endorse"
              ? t("submitting")
              : t("endorseSeller")}
        </button>
        <button
          type="button"
          disabled={submitted.report || busy !== null}
          onClick={() => toggleKind("report")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-red-500/40 hover:text-red-500 disabled:cursor-default disabled:opacity-60"
        >
          <Flag size={12} />
          {submitted.report ? t("reported") : t("reportSeller")}
        </button>
      </div>

      {openKind && !submitted[openKind] && (
        <div className="space-y-2 rounded-md border border-border bg-surface p-3">
          <label
            htmlFor={reasonId}
            className="text-[11px] font-medium uppercase text-muted"
          >
            {openKind === "endorse"
              ? t("commentOptional")
              : t("reasonOptional")}
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            rows={3}
            placeholder={
              openKind === "endorse"
                ? t("endorsePlaceholder")
                : t("reasonPlaceholder")
            }
            className="w-full rounded-md border border-border bg-card p-2 text-xs text-foreground outline-none focus:border-primary/40"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenKind(null)}
              className="text-xs text-muted hover:text-foreground"
            >
              {t("cancel")}
            </button>
            {openKind === "endorse" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => submit("endorse", reason.trim())}
                className="rounded-md bg-emerald-600/90 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {busy === "endorse" ? t("submitting") : t("submitEndorsement")}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => submit("report", reason.trim())}
                className="rounded-md bg-red-500/90 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                {busy === "report" ? t("submitting") : t("submitReport")}
              </button>
            )}
          </div>
        </div>
      )}

      {message && <p className="text-xs text-muted">{message}</p>}
    </div>
  );
}
