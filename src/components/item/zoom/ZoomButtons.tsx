"use client";

import type React from "react";
import { cx } from "@/lib/cn";

export function ZoomIconButton({
  onClick,
  label,
  children,
  small = false,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex items-center justify-center font-semibold rounded-full border shadow-sm text-gray-800 dark:text-gray-100 cursor-pointer",
        "bg-white/90 dark:bg-gray-900/70 border-white/40 dark:border-gray-700 backdrop-blur-sm",
        "hover:bg-white dark:hover:bg-gray-800 transition-colors",
        small ? "w-9 h-9 text-xs" : "w-11 h-11 text-sm",
      )}
    >
      {children}
    </button>
  );
}

export function ZoomButton({
  onClick,
  icon,
  label,
  small,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  small?: boolean;
}) {
  return (
    <ZoomIconButton onClick={onClick} label={label} small={small}>
      {icon}
    </ZoomIconButton>
  );
}

export function RotateButton({
  dir,
  onClick,
}: {
  dir: "left" | "right";
  onClick: () => void;
}) {
  const left = dir === "left";
  return (
    <ZoomIconButton
      onClick={onClick}
      label={left ? "Rotate left" : "Rotate right"}
    >
      {left ? (
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 1 1 9 9" />
          <polyline points="3 12 3 18 9 18" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 0-9 9" />
          <polyline points="21 12 21 18 15 18" />
        </svg>
      )}
    </ZoomIconButton>
  );
}

export function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("w-5 h-5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("w-5 h-5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
