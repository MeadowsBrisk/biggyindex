"use client";

import { Circle } from "lucide-react";
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
  return (
    <span
      className={cx(
        "seller-card__badge",
        copy.kind === "f"
          ? "seller-card__badge--flagged"
          : "seller-card__badge--offwall",
      )}
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
