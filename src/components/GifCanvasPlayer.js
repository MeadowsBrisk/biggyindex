"use client";
import { useEffect, useRef, useState } from "react";
import cn from "@/app/cn";

export default function GifCanvasPlayer({ src, playing = true, onPlayingChange, onReady, className, ignoreDelays = false, fps = 24, showControls = true, centered = false }) {
  const canvasRef = useRef(null);
  const [frames, setFrames] = useState([]);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [frameIndex, setFrameIndex] = useState(0); // UI state (throttled)
  const [isPlaying, setIsPlaying] = useState(!!playing);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const rafRef = useRef(0);
  const nextDueRef = useRef(0);
  const frameRef = useRef(0); // internal frame pointer
  const lastUiUpdateRef = useRef(0);
  const decodedRef = useRef([]); // cached patches as ImageData

  useEffect(() => { setIsPlaying(!!playing); }, [playing]);
  useEffect(() => { if (onPlayingChange) onPlayingChange(isPlaying); }, [isPlaying, onPlayingChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const [{ parseGIF, decompressFrames }] = await Promise.all([
          import("gifuct-js")
        ]);
        const r = await fetch(src);
        const buf = await r.arrayBuffer();
        const gif = parseGIF(buf);
        const df = decompressFrames(gif, true); // buildPatch RGBA
        if (cancelled) return;
        // Prebuild ImageData for faster blits
        try {
          const list = df.map((f) => ({
            imageData: new ImageData(f.patch, f.dims.width, f.dims.height),
            dims: f.dims,
            delay: f.delay,
            disposalType: f.disposalType,
          }));
          decodedRef.current = list;
          setFrames(list);
        } catch {
          decodedRef.current = df.map((f) => ({ imageData: null, dims: f.dims, delay: f.delay, disposalType: f.disposalType, patch: f.patch }));
          setFrames(decodedRef.current);
        }
        const w = gif.lsd.width;
        const h = gif.lsd.height;
        setDims({ width: w, height: h });
        frameRef.current = 0;
        setFrameIndex(0);
        setIsLoading(false);
        try { if (!cancelled && typeof onReady === 'function') onReady({ width: w, height: h }); } catch {}
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("GIF decode failed:", e);
        if (!cancelled) {
          setLoadError('Failed to load GIF');
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  // Render a frame onto canvas
  const renderFrame = (idx) => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext?.("2d");
    const f = (decodedRef.current.length ? decodedRef.current : frames)[idx];
    if (!ctx || !f) return;
    // Resize canvas if needed
    if (cvs.width !== dims.width || cvs.height !== dims.height) {
      cvs.width = dims.width;
      cvs.height = dims.height;
    }
    ctx.imageSmoothingEnabled = true;
    // Honor simple disposal: 2 = restore to background
    if (f.disposalType === 2) ctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
    const imageData = f.imageData || new ImageData(f.patch, f.dims.width, f.dims.height);
    ctx.putImageData(imageData, f.dims.left, f.dims.top);
  };

  // Animation loop using rAF for smoother timing; optionally ignore GIF delays for realtime playback
  useEffect(() => {
    if (!frames.length || !canvasRef.current) return;
    cancelAnimationFrame(rafRef.current);
    if (!isPlaying) {
      renderFrame(frameRef.current);
      return;
    }
    const start = performance.now();
    nextDueRef.current = start + Math.max(16, (frames[frameRef.current]?.delay || 10) * 10);
    const loop = (t) => {
      if (ignoreDelays) {
        // fixed-step based on target fps
        const step = Math.max(10, 1000 / fps);
        if (t >= nextDueRef.current) {
          frameRef.current = (frameRef.current + 1) % frames.length;
          nextDueRef.current = t + step;
        }
      } else {
        while (t >= nextDueRef.current) {
          frameRef.current = (frameRef.current + 1) % frames.length;
          nextDueRef.current += Math.max(16, (frames[frameRef.current]?.delay || 10) * 10);
        }
      }
      renderFrame(frameRef.current);
      if (t - lastUiUpdateRef.current > 100) {
        setFrameIndex(frameRef.current);
        lastUiUpdateRef.current = t;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [frames, isPlaying, ignoreDelays]);

  // Seek handler
  const onSeek = (e) => {
    const idx = Number(e.target.value) || 0;
    setFrameIndex(idx);
    renderFrame(idx);
    frameRef.current = idx;
  };

  return (
    <div className={cn("w-full", centered && "h-full grid place-items-center mx-auto", className)}>
      <div className={cn("relative overflow-hidden", centered ? "max-w-full max-h-full mx-auto" : "w-full") }>
        <canvas ref={canvasRef} className={cn("block", centered ? "max-w-full max-h-full w-auto h-auto mx-auto" : "max-w-full h-auto")} />
        {(isLoading || loadError) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-black/40 text-white text-xs">
              {!loadError ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                  <span>Decoding GIF…</span>
                </>
              ) : (
                <span>{loadError}</span>
              )}
            </div>
          </div>
        )}
      </div>
      {showControls ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
          <button className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setIsPlaying((v) => !v)}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <span>{frameIndex + 1}/{frames.length || 0}</span>
          <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={frameIndex} onChange={onSeek} className="flex-1" />
        </div>
      ) : null}
    </div>
  );
}


