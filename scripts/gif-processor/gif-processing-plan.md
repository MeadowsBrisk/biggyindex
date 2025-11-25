# GIF Processing Plan (Updated – 2025-09-07 / rev controls)

Note: Always use yarn, not npm.

## 0. Status Summary
Current implementation now stores outputs in structured subdirectories:
- Posters: /gif-cache/posters/<hash>.jpg
- Videos:  /gif-cache/videos/<hash>.mp4
Legacy flat files are migrated automatically on next run.
Other points unchanged: poster generation, optional MP4, mapping file, idempotent re-runs, concurrency, front-end integration (GifMedia + useGifAsset).

## 1. Goals (Reaffirmed)
Provide a pipeline that precomputes lightweight poster + efficient MP4 for GIF content so the front-end can:
- Show fast-loading static thumbnails in lists (poster).
- Play smooth, looped, muted animations on demand (MP4) instead of heavyweight GIF decoding.
- Honor global “Pause GIFs” state via posters only (no video decoding).
- Fallback gracefully to original remote GIF if asset not yet processed (new/unmapped items).

## 2. Scope Changes (Compared to Original Draft)
| Feature | Original Plan | Current | Reason |
|---------|---------------|---------|--------|
| Animated WebP | Planned optional | Dropped | Larger files, little gain vs MP4 |
| Poster Format Auto Alpha Handling | Deferred | Still deferred | Simplicity; most GIFs w/ solid bg |
| Mapping Embedding in Items | Phase 2 | Not done yet | Keeps indexer independent |
| Pruning Orphans | Phase 2 | Not implemented | Will add once front-end integration stable |
| Front-End Integration | Future | In progress (baseline done) | Required next step |

## 3. Mapping File Schema (Current)
`public/gif-cache/gif-map.json`
```jsonc
{
  "<originalGifUrl>": {
    "hash": "12charsha1",
    "poster": "/gif-cache/posters/<hash>.jpg",    // always present on success
    "video": "/gif-cache/videos/<hash>.mp4",      // only if --video and transcode OK
    "width": 640,
    "height": 480,
    "frames": 42,
    "status": "ok" | "failed" | "skipped",
    "reason": "<failure or skip reason>"
  }
}
```
(Older entries with /gif-cache/<hash>.jpg|.mp4 are migrated to subdirectories.)

## 4. Command Flags (Effective Subset)
Changed default: `--include-image-urls` now enabled by default (flag only needed to disable via `--include-image-urls=false`). Table otherwise unchanged.

## 5. Processing Flow (Per GIF)
1. Hash original URL → derive deterministic base filename.
2. Skip if outputs exist and not `--force`.
3. Size check (HEAD best-effort). Skip if exceeds max MB.
4. Download with timeout + retry guard.
5. Poster: first frame via `sharp(..., { animated:true, pages:1 })`, resize to max width, export.
6. Optional MP4: ffmpeg scale + even-dimension filter + optional fps normalization.
7. Update mapping entry with status & metadata.

## 6. Error & Skip Reasons
| Reason | Meaning |
|--------|---------|
| `size-head` | HEAD size exceeded limit |
| `size-limit` | Downloaded size exceeded limit |
| `timeout` | Network aborted (timeout) |
| `download-failed` | Other network error after retries |
| `poster:<err>` | Sharp failed poster generation |
| `ffmpeg-missing` | ffmpeg unavailable for requested video |
| `ffmpeg:<code>` | ffmpeg returned non-zero exit code |
| `exists` | Skipped due to cache & no force |

## 7. Front-End Integration Plan
### 7.1 Overview
Introduce a small client helper that loads `gif-map.json` once and exposes lookups so ItemCard (and any future component) can render an MP4 or poster instead of the raw GIF. Integrate with `pauseGifsAtom` to decide between poster vs video playback.

### 7.2 Data Loader
File: `src/lib/gifAssets.js`
```js
let _mapPromise; let _cache; // in-memory
export async function loadGifMap() {
  if (_cache) return _cache;
  if (!_mapPromise) {
    _mapPromise = fetch('/gif-cache/gif-map.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({}))
      .then(j => (_cache = j));
  }
  return _mapPromise;
}
export function getGifEntry(url) { return _cache ? _cache[url] : null; }
```
Integration points:
- Preload once in a layout effect (optional) or lazy load on first GIF card render.
- Provide a React hook `useGifAsset(url)` that triggers the load and returns `{ poster, video, loading }`.

### 7.3 ItemCard Behavior
| State | Condition | Render |
|-------|-----------|--------|
| Mapping present + pause on | `entry && pauseGifsAtom===true` | `<img src={proxyImage(entry.posterAbsOrOriginal)} />` (poster proxied) |
| Mapping present + video available + not paused | `entry.video && !pause` | `<video src={entry.video} poster={entry.poster} ...controlsHidden />` |
| Mapping present but no video (only poster) | `entry && !entry.video` | `<img ...>` poster |
| Mapping missing | default | Original GIF URL (current behavior) |

### 7.4 Video Element Defaults
- Attributes: `loop muted playsInline autoPlay` (only when not paused and in view—optional intersection observer tweak later).
- Add CSS class for consistent sizing (object-cover to match existing <img> usage).
- Poster attribute uses local poster path (not proxied to avoid double caching needed? Optionally keep consistent and proxy it too).

### 7.5 Controls Overlay (Revised)
ItemCard GIF controls simplified:
- Play/Pause icon button (no text) placed immediately to the right of the GIF badge (top-left corner).
- Restart removed.
- Progress/seek bar removed from card to keep grid lightweight.
- Badge remains indicating processed GIF.

### 7.6 Pause Interaction
Unchanged logically; video unmounted when global pause active. Local state restored when un-paused.

### 7.7 Progressive Enhancement Strategy
1. Render original `<img src={originalGif}>` while mapping loading.
2. When mapping resolves:
   - If entry exists: replace with poster/video combination.
   - If not: keep original GIF.
3. Maintain layout stability (same container aspect class used for video & poster).

### 7.8 API / Helper Contract
Hook `useGifAsset(originalUrl)` returns:
```ts
interface GifAssetHook {
  loading: boolean;
  hasEntry: boolean;
  poster: string | null;         // local path (e.g. /gif-cache/hash.jpg)
  posterProxied: string | null;   // through proxyImage()
  video: string | null;          // local mp4 path
  status: 'ok' | 'missing' | 'failed' | 'skipped' | null;
  reason?: string;
}
```
- Normalizes relative paths to absolute for `proxyImage` (e.g. `posterProxied = proxyImage(location.origin + poster)` or simply `proxyImage(poster)` if proxy accepts relative root). If proxy requires absolute, ensure `new URL(poster, window.location.origin).href`.

### 7.9 Performance Considerations
- Mapping file size is proportional to number of GIFs (expected small). Keep pretty JSON (already pretty) – could minify later.
- Consider caching mapping in `sessionStorage` between navigations (optional).
- Postpone intersection-based lazy pause/unpause until baseline integration stable.

### 7.10 Implementation Notes (Current State – Revised)
- Asset directories separated (posters/, videos/). Migration logic in process-gifs.js adjusts legacy paths & renames files.
- Mapping normalization strips any /public prefix.
- ItemCard controls now consist of a single small icon button (pause || play) next to the GIF badge; no bottom overlay, no progress bar.
- GifMedia no longer tracks per-card progress; simplified state.
- ImageZoomPreview now replaces previous GifCanvasPlayer with MP4 playback (via ZoomGifVideo) when available.
- GIF fallback preserved: if mapping or video missing, poster (if any) or original GIF (proxied) used.
- Zoom modal preloading skips GIF originals; avoids redundant network for heavy GIFs when MP4 exists.
- Video poster never set to the original GIF (prevents downloading large GIF just to supply poster); uses processed poster only.

## 8. Front-End Implementation Checklist (Updated)
| Step | Description | Status |
|------|-------------|--------|
| 1 | Add `src/lib/gifAssets.js` with loader + hook | Done |
| 2 | Modify `ItemCard` to detect `.gif` and use hook (`GifMedia`) | Done |
| 3 | Card GIF controls (badge + play/pause icon top-left) | Done |
| 4 | Integrate `pauseGifsAtom` to unmount video | Done |
| 5 | Fallback logic (mapping missing → original GIF) | Done |
| 6 | Memoize proxied poster for pause state | Done |
| 7 | Loading spinner overlay | Done |
| 8 | Zoom preview uses MP4 (GIF fallback) | Done |
| 9 | Skip GIF preloading in zoom when MP4 exists | Done |
| 10 | QA on: Chrome, Firefox, Safari | Pending |

## 9. Future Enhancements (Post Integration)
- Add prune script: remove files in `gif-cache/` not referenced by mapping (safe mode dry-run).
- Add `durationMs` metadata via ffprobe (optional; could let us show timeline scrub later).
- Add per-card lazy loading: only request MP4 when card enters viewport (currently MP4 is static file so browser will lazy based on standard loading heuristics; can still set `preload="none"`).
- Add small global service worker-based warm cache for popular MP4s (maybe overkill).
- Replace text buttons with accessible icon buttons (ARIA labels kept).
- Consider minified mapping for production build.

## 10. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Missing mapping on first load after new index | Fallback to original GIF seamlessly |
| MP4 decode overhead on large lists | Global pause + only auto-play when visible; add future intersection gating |
| Proxy mismatch for poster paths | Normalize via helper & wrap in try/catch |
| Race: user toggles pause mid-mapping load | Hook listens to atom; always re-check state on completion |
| Large number of GIFs inflating map size | Optionally compress/minify JSON; paginate or split later |

## 11. Usage Snippet (Updated paths)
```jsx
// poster => /gif-cache/posters/<hash>.jpg, video => /gif-cache/videos/<hash>.mp4
<video src={asset.video} poster={asset.poster} ... />
```

## 12. Next Steps
- Prune script for orphaned poster/video files.
- Add duration metadata via ffprobe.
- Intersection-based autoplay gating (scroll into view) for large lists.
- Accessible icon components for play/pause with focus ring improvements.
- Optional sessionStorage caching of mapping.
