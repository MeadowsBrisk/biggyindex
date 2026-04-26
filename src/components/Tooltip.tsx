"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  /** Placement relative to trigger */
  side?: "top" | "bottom" | "left" | "right";
  /** Delay before showing (ms) */
  delay?: number;
}

/**
 * Lightweight tooltip — renders via portal at body level to avoid
 * overflow/contain-paint clipping from parent containers.
 */
export function Tooltip({
  content,
  children,
  side = "bottom",
  delay = 400,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    transform: string;
  } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(() => {
    timeout.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setCoords(computePosition(rect, side));
      }
      setVisible(true);
    }, delay);
  }, [delay, side]);

  const hide = useCallback(() => {
    clearTimeout(timeout.current);
    setVisible(false);
    setCoords(null);
  }, []);

  useEffect(() => () => clearTimeout(timeout.current), []);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex pointer-events-auto"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible &&
        coords &&
        createPortal(
          <span
            role="tooltip"
            className="fixed z-9999 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium bg-foreground text-background shadow-lg pointer-events-none"
            style={{
              top: coords.top,
              left: coords.left,
              transform: coords.transform,
              animation: "tooltip-in 120ms ease-out both",
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

function computePosition(
  rect: DOMRect,
  side: string,
): { top: number; left: number; transform: string } {
  const gap = 6;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  switch (side) {
    case "top":
      return {
        top: rect.top - gap,
        left: cx,
        transform: "translate(-50%, -100%)",
      };
    case "bottom":
      return {
        top: rect.bottom + gap,
        left: cx,
        transform: "translate(-50%, 0)",
      };
    case "left":
      return {
        top: cy,
        left: rect.left - gap,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        top: cy,
        left: rect.right + gap,
        transform: "translate(0, -50%)",
      };
    default:
      return {
        top: rect.bottom + gap,
        left: cx,
        transform: "translate(-50%, 0)",
      };
  }
}
