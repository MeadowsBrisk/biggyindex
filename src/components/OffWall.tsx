"use client";

import { AlertTriangle, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cx } from "@/lib/cn";
import { offWallKind, offWallReasonKey } from "@/lib/off-wall";

interface OffWallProps {
  ow?: 1 | 2 | null;
  owr?: string | null;
}

function useOffWallCopy({ ow, owr }: OffWallProps) {
  const t = useTranslations("seller.offWall");
  const kind = offWallKind({ ow });
  if (!kind) return null;
  if (kind === "u") {
    return { kind, badge: t("badgeUnlisted"), notice: t("unlistedNotice") };
  }
  const reason = offWallReasonKey(owr);
  return {
    kind,
    badge: t("badgeFlagged"),
    notice: reason
      ? t("flaggedNotice", { reason: t(`reasons.${reason}`) })
      : t("flaggedNoticeGeneric"),
  };
}

export function OffWallBadge(props: OffWallProps) {
  const copy = useOffWallCopy(props);
  if (!copy) return null;
  if (copy.kind === "f") {
    return (
      <span
        role="img"
        className="seller-card__badge seller-card__badge--flagged"
        title={copy.notice}
        aria-label={copy.badge}
      >
        <AlertTriangle size={10} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className="seller-card__badge seller-card__badge--offwall"
      title={copy.notice}
    >
      {copy.badge}
    </span>
  );
}

export function OffWallNotice(props: OffWallProps) {
  const copy = useOffWallCopy(props);
  if (!copy) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Circle
        size={7}
        className={cx(
          "shrink-0 fill-current",
          copy.kind === "f" && "text-yellow-500",
        )}
      />
      {copy.notice}
    </span>
  );
}
