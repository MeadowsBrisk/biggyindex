/**
 * Route-level loading skeleton for seller pages.
 *
 * Besides the UX nicety, this mirrors /item/[ref]/loading.tsx deliberately:
 * item/[ref] is the ONLY param route whose runtime renders stay storable in
 * prod, and the presence of a route-level Suspense boundary is the sole
 * structural difference from seller/category (2026-07 caching investigation).
 * Kept in lockstep with the durable-CDN fallback in next.config.ts.
 */
export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-[var(--surface)] animate-pulse" />
        <div className="space-y-2">
          <div className="h-6 w-48 rounded bg-[var(--surface)] animate-pulse" />
          <div className="h-4 w-32 rounded bg-[var(--surface)] animate-pulse" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              key={i}
              className="h-24 rounded-xl bg-[var(--surface)] animate-pulse"
            />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              key={i}
              className="h-10 rounded-lg bg-[var(--surface)] animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
