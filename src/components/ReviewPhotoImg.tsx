"use client";

/**
 * <ReviewPhotoImg> — buyer review photo with the self-hosting fallback
 * cascade.
 *
 * Review photos are mirrored to the image CDN by the crawler's
 * `review-images` stage; the optimised URL is DERIVED from the raw
 * LittleBiggy URL via the site-wide FNV-1a hash contract
 * (`getReviewPhotoUrl`), so no new data is plumbed through review payloads.
 * A photo can legitimately be missing from the CDN — brand-new photo the
 * daily mirror pass hasn't seen, failed optimisation, GC'd archive photo —
 * and user content has no placeholder equivalent (a broken image is worse
 * than a hotlink). So, the deliberate OPPOSITE of seller avatars (which fall
 * back to initials), this renders:
 *
 *   1. the optimised CDN variant, then on error
 *   2. the ORIGINAL raw LB URL (the stored string — not the normalised
 *      `i.littlebiggy.org` fiction, which may not resolve), then on error
 *   3. whatever the parent decides via `onDead` (typically prune/unmount;
 *      left unhandled the element keeps the browser's broken state, exactly
 *      like the pre-mirror hotlinking behaviour).
 *
 * The `complete && naturalWidth === 0` check on mount catches a CDN 404 that
 * resolved BEFORE hydration attached the error listener (SSR'd markup — the
 * browser does not replay `error` events), so a CDN miss can never leave a
 * permanently broken image. `onCdnLoad` fires only when the optimised
 * variant genuinely loaded, which parents use as proof the hash is mirrored
 * before upgrading zoom galleries to CDN `full.avif`.
 */

import { useCallback, useRef, useState } from "react";
import { getReviewPhotoUrl } from "@/lib/images";

interface ReviewPhotoImgProps
  extends Omit<
    React.ImgHTMLAttributes<HTMLImageElement>,
    "src" | "srcSet" | "onError" | "onLoad"
  > {
  /** Raw LittleBiggy photo URL (the stored review-segment string). */
  rawUrl: string;
  /** CDN tier to attempt first: 600px `thumb` for tiles/cards, `full` for
      modal/lightbox surfaces. */
  size?: "thumb" | "full";
  /** The optimised CDN variant actually loaded — the hash is mirrored, so
      sibling variants (e.g. `full.avif` for zoom) exist too. */
  onCdnLoad?: (rawUrl: string) => void;
  /** Both the CDN variant AND the raw original failed to load. */
  onDead?: (rawUrl: string) => void;
}

export function ReviewPhotoImg({
  rawUrl,
  size = "thumb",
  onCdnLoad,
  onDead,
  alt,
  ...imgProps
}: ReviewPhotoImgProps) {
  // `for` pins the cascade stage to its rawUrl so the state resets when a
  // parent reuses this element for a different photo (render-phase reset).
  const [state, setState] = useState<{ for: string; stage: "cdn" | "raw" }>({
    for: rawUrl,
    stage: "cdn",
  });
  if (state.for !== rawUrl) setState({ for: rawUrl, stage: "cdn" });
  const stage = state.for === rawUrl ? state.stage : "cdn";

  const cdnUrl = getReviewPhotoUrl(rawUrl, size);
  const src = stage === "cdn" && cdnUrl ? cdnUrl : rawUrl;

  const handleError = useCallback(() => {
    if (stage === "cdn" && cdnUrl) {
      setState({ for: rawUrl, stage: "raw" });
    } else {
      onDead?.(rawUrl);
    }
  }, [stage, cdnUrl, rawUrl, onDead]);

  const handleLoad = useCallback(() => {
    if (stage === "cdn" && cdnUrl) onCdnLoad?.(rawUrl);
  }, [stage, cdnUrl, rawUrl, onCdnLoad]);

  // One-shot mount check for loads/errors that settled pre-hydration. Guarded
  // by a ref so callback-identity churn (stage flips) can't re-run it against
  // an <img> whose `src` swap is still in flight.
  const checkedRef = useRef(false);
  const attachRef = useCallback(
    (node: HTMLImageElement | null) => {
      if (!node || checkedRef.current) return;
      checkedRef.current = true;
      if (!node.complete) return;
      if (node.naturalWidth === 0) handleError();
      else handleLoad();
    },
    [handleError, handleLoad],
  );

  return (
    // biome-ignore lint/performance/noImgElement: review photos are arbitrary marketplace URLs behind a client-side fallback cascade
    <img
      ref={attachRef}
      src={src}
      alt={alt ?? ""}
      onError={handleError}
      onLoad={handleLoad}
      {...imgProps}
    />
  );
}
