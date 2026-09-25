"use client";

import { useSetAtom } from "jotai";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useRef, useSyncExternalStore } from "react";
import { RelativeTime } from "@/components/home/RelativeTime";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { decodeEntities } from "@/lib/format";
import type { ServerCurrency } from "@/lib/market/currency";
import type { HomeFeedEvent } from "@/lib/types";
import { expandedRefNumAtom } from "@/store/atoms";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const EST_EVENT_PX = 230;
const COVER_PX = 3200;
const SPEED_PX_PER_S = 44;
const COAST_TAU_S = 0.32;
const COAST_MIN_V = 5;
const COAST_MAX_S = 0.85;
const DRAG_THRESHOLD_PX = 5;
const VELOCITY_WINDOW_MS = 80;
const DT_CLAMP_S = 0.05;
const LABEL_GAP_PX = 16;

function TickerSequence({
  events,
  symbol,
  rate,
  duplicate,
  onOpen,
  seqRef,
}: {
  events: HomeFeedEvent[];
  symbol: string;
  rate: number;
  duplicate?: boolean;
  onOpen: (ref: string) => void;
  seqRef?: React.Ref<HTMLDivElement>;
}) {
  const t = useTranslations("home.ticker");
  const money = (usd: number) => `${symbol}${(usd * rate).toFixed(2)}`;
  return (
    <div
      className="home-ticker-track"
      aria-hidden={duplicate || undefined}
      ref={seqRef}
    >
      {events.map((e) => {
        const name = decodeEntities(e.n);
        return (
          <Fragment key={`${e.k}-${e.id}`}>
            <button
              type="button"
              className="home-tk"
              tabIndex={duplicate ? -1 : undefined}
              onClick={() => onOpen(e.ref)}
              aria-label={t("view", { name })}
            >
              <span className={`home-tk-kind home-tk-kind--${e.k}`}>
                {t(`kinds.${e.k}`)}
              </span>
              <b>{name}</b>
              {e.k === "drop" && e.was != null ? (
                <span>
                  <span className="home-tk-was">{money(e.was)}</span> →{" "}
                  {money(e.u ?? 0)}
                </span>
              ) : (
                <span>
                  {e.sn}
                  {e.u != null ? ` · ${money(e.u)}` : ""}
                </span>
              )}
              {e.at && (
                <span className="home-tk-time">
                  {e.k !== "new" && `${t("seen")} `}
                  <RelativeTime iso={e.at} />
                </span>
              )}
            </button>
            <span className="home-tk-sep" />
          </Fragment>
        );
      })}
    </div>
  );
}

/** Drag-throwable marquee: one rAF loop writes the transform; no React state per frame. */
export function Ticker({
  events,
  currency,
}: {
  events: HomeFeedEvent[];
  currency: ServerCurrency;
}) {
  const t = useTranslations("home.ticker");
  const { symbol, rate } = useDisplayCurrency(currency);
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const lblRef = useRef<HTMLSpanElement>(null);
  const inRef = useRef<HTMLDivElement>(null);
  const seq0Ref = useRef<HTMLDivElement>(null);
  const seq1Ref = useRef<HTMLDivElement>(null);
  const seqWRef = useRef(0);

  const seqEstPx = Math.max(1, events.length) * EST_EVENT_PX;
  const copies = Math.min(24, Math.max(3, Math.ceil(COVER_PX / seqEstPx) + 2));

  // Re-measure after hydration (relative labels swap) and once fonts settle, or the seam jumps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: events/mounted are the re-measure triggers
  useEffect(() => {
    const s0 = seq0Ref.current;
    const s1 = seq1Ref.current;
    if (!s0 || !s1) return;
    const measure = () => {
      const period = s1.offsetLeft - s0.offsetLeft;
      if (period > 0) seqWRef.current = period;
    };
    measure();
    let cancelled = false;
    const raf = requestAnimationFrame(measure);
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => !cancelled && measure()).catch(() => {});
    }
    const ro = new ResizeObserver(measure);
    ro.observe(s0);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [events, mounted]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = inRef.current;
    if (!viewport || !track) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const lbl = lblRef.current;
    let pos = 0;
    let started = false;
    let paused = false;
    let dragging = false;
    let coasting = false;
    let vel = 0;
    let coastElapsed = 0;

    const wrap = (p: number) => {
      const w = seqWRef.current;
      if (w <= 0) return 0;
      return -(((-p % w) + w) % w);
    };
    const apply = () => {
      if (seqWRef.current <= 0) return;
      track.style.transform = `translate3d(${wrap(pos)}px, 0, 0)`;
    };
    // While a drag or throw is live the track ignores the pointer, so the release click can't land on an event.
    const setTrackInteractive = (on: boolean) => {
      track.style.pointerEvents = on ? "" : "none";
    };

    let last = 0;
    let rafId = 0;
    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, DT_CLAMP_S) : 0;
      last = now;
      if (!started && seqWRef.current > 0) {
        const clearance = (lbl?.offsetWidth ?? 96) + LABEL_GAP_PX;
        pos = -(seqWRef.current - clearance);
        started = true;
        apply();
        return;
      }
      if (dragging) return;
      if (coasting) {
        pos += vel * dt;
        vel *= Math.exp(-dt / COAST_TAU_S);
        coastElapsed += dt;
        if (Math.abs(vel) < COAST_MIN_V || coastElapsed >= COAST_MAX_S) {
          coasting = false;
          setTrackInteractive(true);
        }
        apply();
        return;
      }
      if (!reduced && !paused && seqWRef.current > 0) {
        pos -= SPEED_PX_PER_S * dt;
        apply();
      }
    };
    rafId = requestAnimationFrame(frame);

    const onEnter = () => {
      paused = true;
    };
    const onLeave = () => {
      paused = false;
    };

    let samples: { t: number; x: number }[] = [];
    let startPos = 0;
    let pressX = 0;
    let downX = 0;
    let downY = 0;
    let moved = false;
    let activeId = -1;

    // No pointer capture here: capturing retargets the synthetic click to the viewport and kills plain clicks.
    const onPointerDown = (e: PointerEvent) => {
      if (dragging || e.button > 0) return;
      dragging = true;
      coasting = false;
      activeId = e.pointerId;
      startPos = pos;
      pressX = e.clientX;
      downX = e.clientX;
      downY = e.clientY;
      moved = false;
      samples = [{ t: performance.now(), x: e.clientX }];
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== activeId) return;
      const now = performance.now();
      pos = startPos + (e.clientX - pressX);
      samples.push({ t: now, x: e.clientX });
      while (samples.length > 2 && now - samples[0].t > VELOCITY_WINDOW_MS)
        samples.shift();
      if (
        !moved &&
        Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_THRESHOLD_PX
      ) {
        moved = true;
        setTrackInteractive(false);
        try {
          viewport.setPointerCapture(e.pointerId);
        } catch {}
      }
      if (moved) apply();
    };

    const endDrag = (e: PointerEvent, allowCoast: boolean) => {
      if (e.pointerId !== activeId) return;
      const now = performance.now();
      dragging = false;
      activeId = -1;
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch {}
      let v = 0;
      if (allowCoast && moved) {
        samples.push({ t: now, x: e.clientX });
        const first = samples.find((s) => now - s.t <= VELOCITY_WINDOW_MS);
        const lastS = samples[samples.length - 1];
        if (first && lastS && lastS.t > first.t) {
          v = ((lastS.x - first.x) / (lastS.t - first.t)) * 1000;
        }
      }
      if (Math.abs(v) >= COAST_MIN_V) {
        coasting = true;
        vel = v;
        coastElapsed = 0;
      } else {
        coasting = false;
        setTrackInteractive(true);
      }
    };
    const onPointerUp = (e: PointerEvent) => endDrag(e, true);
    const onPointerCancel = (e: PointerEvent) => endDrag(e, false);

    const onClickCapture = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };

    const onVisibility = () => {
      cancelAnimationFrame(rafId);
      if (!document.hidden) {
        last = 0;
        rafId = requestAnimationFrame(frame);
      }
    };

    viewport.addEventListener("pointerenter", onEnter);
    viewport.addEventListener("pointerleave", onLeave);
    viewport.addEventListener("pointerdown", onPointerDown);
    // Window-level so a sub-threshold press released off the strip still ends the gesture.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    viewport.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      setTrackInteractive(true);
      track.style.transform = "";
      viewport.removeEventListener("pointerenter", onEnter);
      viewport.removeEventListener("pointerleave", onLeave);
      viewport.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      viewport.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="home-ticker" ref={viewportRef}>
      <span className="home-ticker-lbl" ref={lblRef}>
        <span className="home-dot" />
        {t("label")}
      </span>
      <div className="home-ticker-in" ref={inRef}>
        {Array.from({ length: copies }, (_, i) => (
          <TickerSequence
            // biome-ignore lint/suspicious/noArrayIndexKey: copies are identical by design
            key={i}
            events={events}
            symbol={symbol}
            rate={rate}
            duplicate={i !== 0}
            onOpen={setRefNum}
            seqRef={i === 0 ? seq0Ref : i === 1 ? seq1Ref : undefined}
          />
        ))}
      </div>
    </div>
  );
}
