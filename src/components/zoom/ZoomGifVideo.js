"use client";
import React, { useEffect, useRef } from 'react';
import { useGifAsset } from '@/lib/gifAssets';

/* Displays processed GIF as MP4 (if available) or poster image fallback.
   Keeps behaviour simple: no progress bar or seek UI (restore earlier styling simplicity).
*/
export default function ZoomGifVideo({ originalUrl, playing, globalPause, alt, onReady }) {
  const asset = useGifAsset(originalUrl);
  const hasPoster = !!asset.posterProxied;
  const showVideo = asset.video && !globalPause && playing;
  const poster = hasPoster ? asset.posterProxied : (asset.posterProxied || originalUrl);
  const videoRef = useRef(null);

  useEffect(() => { if (!showVideo) { /* no-op placeholder */ } }, [showVideo]);

  if (!showVideo) {
    return (
      <img
        src={poster}
        alt={alt}
        className="max-h-full max-w-full w-auto block mx-auto select-none object-contain"
        draggable={false}
        loading="eager"
        decoding="async"
        onLoad={() => { try { onReady && onReady(); } catch {} }}
      />
    );
  }
  return (
    <video
      ref={videoRef}
      src={asset.video}
      poster={hasPoster ? asset.posterProxied : undefined}
      className="max-h-full max-w-full w-auto block select-none"
      playsInline
      muted
      loop
      autoPlay
      preload="metadata"
      onLoadedMetadata={() => { try { onReady && onReady(); } catch {} }}
    />
  );
}
