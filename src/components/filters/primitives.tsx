"use client";

import { Pin, X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { cx } from "@/lib/cn";

export const SUB_LABEL =
  "text-[10px] font-semibold uppercase tracking-wider text-muted leading-4";

export const TEXT_ACTION = cx(
  SUB_LABEL,
  "rounded-md enabled:hover:text-foreground transition-colors cursor-pointer disabled:cursor-default disabled:opacity-60",
);

export const SMALL_CONTROL = cx(
  SUB_LABEL,
  "inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-surface px-2 hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer",
);

export function SubLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(SUB_LABEL, "mb-1.5", className)}>{children}</div>;
}

export type ChipTone = "neutral" | "selected" | "solid" | "excluded";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral:
    "border-border text-muted hover:bg-surface-hover hover:text-foreground",
  selected: "border-primary/40 bg-primary/20 text-primary",
  solid: "border-transparent bg-primary text-primary-foreground",
  excluded: "border-transparent bg-red-500/20 text-red-400 line-through",
};

export function FilterChip({
  tone = "neutral",
  count,
  icon,
  trailing,
  children,
  className,
  onClick,
  onContextMenu,
  title,
  pressed,
  dense,
}: {
  tone?: ChipTone;
  count?: number;
  icon?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  pressed?: boolean;
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      aria-pressed={pressed}
      className={cx(
        "inline-flex h-7 max-w-full items-center rounded-md border font-medium whitespace-nowrap select-none cursor-pointer transition-colors",
        dense ? "gap-1 px-1.5 text-[11px]" : "gap-1.5 px-2 text-xs",
        CHIP_TONE[tone],
        className,
      )}
    >
      {tone === "excluded" && !icon && !trailing ? (
        <X size={11} aria-hidden="true" className="shrink-0" />
      ) : (
        icon
      )}
      {children}
      {count != null && (
        <span className={cx("opacity-60 tabular-nums", dense && "text-[10px]")}>
          {count}
        </span>
      )}
      {trailing}
    </button>
  );
}

export function PinToggle({
  pinned,
  onToggle,
  pinTitle,
  unpinTitle,
}: {
  pinned: boolean;
  onToggle: () => void;
  pinTitle: string;
  unpinTitle: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={pinned}
      title={pinned ? unpinTitle : pinTitle}
      className={cx(
        "p-0.5 rounded transition-colors cursor-pointer",
        pinned ? "text-primary" : "text-muted/40 hover:text-muted",
      )}
    >
      <Pin size={12} className={pinned ? "fill-current" : ""} />
    </button>
  );
}

export function SwitchRow({
  label,
  title,
  checked,
  onChange,
}: {
  label: string;
  title?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={onChange}
      className={cx(
        "flex min-h-7 w-full items-center justify-between gap-3 text-xs font-medium leading-4 cursor-pointer transition-colors",
        checked ? "text-foreground" : "text-muted hover:text-foreground",
      )}
    >
      <span className="text-left">{label}</span>
      <span
        aria-hidden="true"
        className={cx(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cx(
            "inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
