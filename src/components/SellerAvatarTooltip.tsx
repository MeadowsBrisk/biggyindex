"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface SellerAvatarTooltipProps {
  sellerName: string;
  imageUrl?: string | null;
  /** Show tooltip with initial letter even when no imageUrl */
  showInitialTooltip?: boolean;
  /** Tooltip image size in px (default 140) */
  tooltipSize?: number;
  children: ReactNode;
}

/**
 * Cursor-following tooltip that shows a larger seller logo/banner image
 * with seller name on hover. Portal-rendered to document.body.
 * Ported from food-aggregator-example.
 */
export function SellerAvatarTooltip({
  sellerName,
  imageUrl,
  showInitialTooltip,
  tooltipSize,
  children,
}: SellerAvatarTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [direction, setDirection] = useState<"above" | "below">("above");
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (visible) {
      if (unmountTimer.current) {
        clearTimeout(unmountTimer.current);
        unmountTimer.current = null;
      }
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOpacity(1);
        });
      });
    } else {
      setOpacity(0);
      unmountTimer.current = setTimeout(() => setShouldRender(false), 180);
    }
    return () => {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
    };
  }, [visible]);

  const updatePos = useCallback((e: MouseEvent) => {
    const vw = window.innerWidth;
    const margin = 12;
    // Flip below when cursor is within 200px of viewport top
    const threshold = 200;
    setDirection(e.clientY < threshold ? "below" : "above");
    setPos({
      x: Math.max(margin, Math.min(e.clientX, vw - margin)),
      y: e.clientY,
    });
  }, []);

  const shouldShowTooltip = !!imageUrl || !!showInitialTooltip;

  const onEnter = useCallback(
    (e: MouseEvent) => {
      if (!shouldShowTooltip) return;
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      updatePos(e);
      showTimer.current = setTimeout(() => setVisible(true), 200);
    },
    [shouldShowTooltip, updatePos],
  );

  const onLeave = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    hideTimer.current = setTimeout(() => setVisible(false), 80);
  }, []);

  const onMove = useCallback(
    (e: MouseEvent) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => updatePos(e));
    },
    [updatePos],
  );

  useEffect(() => {
    setMounted(true);
    const el = triggerRef.current;
    if (!el) return;
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("mousemove", onMove);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("mousemove", onMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (showTimer.current) clearTimeout(showTimer.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onEnter, onLeave, onMove]);

  const initial = sellerName.charAt(0).toUpperCase();

  // Tooltip loads the 600px thumb version instead of the tiny icon
  const tooltipImgUrl = imageUrl?.replace("/icon.avif", "/thumb.avif") ?? imageUrl;

  return (
    <>
      <span ref={triggerRef} className="inline-flex">
        {children}
      </span>
      {mounted &&
        shouldRender &&
        shouldShowTooltip &&
        createPortal(
          <div
            className="seller-avatar-tooltip"
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              transform:
                direction === "above"
                  ? "translate(-50%, -100%) translateY(-18px) translateX(8px)"
                  : "translate(-50%, 0%) translateY(18px) translateX(8px)",
              pointerEvents: "none",
              zIndex: 2147483647,
              opacity,
              transition: "opacity 160ms ease-out",
            }}
          >
            <div className="seller-avatar-tooltip__card">
              {direction === "below" && (
                <div className="seller-avatar-tooltip__arrow seller-avatar-tooltip__arrow--top" />
              )}
              <div
                className="seller-avatar-tooltip__img-wrap"
                style={
                  tooltipSize
                    ? { width: tooltipSize, height: tooltipSize }
                    : undefined
                }
              >
                {tooltipImgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tooltipImgUrl}
                    alt={sellerName}
                    loading="eager"
                    decoding="async"
                    className="seller-avatar-tooltip__img"
                    style={
                      tooltipSize
                        ? { padding: 0, objectFit: "cover" }
                        : undefined
                    }
                  />
                ) : (
                  <span className="seller-avatar-tooltip__initial">
                    {initial}
                  </span>
                )}
              </div>
              {direction === "above" && (
                <div className="seller-avatar-tooltip__arrow" />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
