/**
 * Route-level loading skeleton for category landing pages.
 *
 * More than a UX nicety: a route-level Suspense boundary is believed to be the
 * structural difference that keeps a param route's runtime renders storable,
 * so this mirrors /item/[ref]/loading.tsx and stays in lockstep with the
 * durable-CDN fallback in next.config.ts.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      <div className="space-y-3">
        <div className="h-8 w-64 rounded bg-[var(--surface)] animate-pulse" />
        <div className="h-4 w-40 rounded bg-[var(--surface)] animate-pulse" />
        <div className="h-4 w-full max-w-2xl rounded bg-[var(--surface)] animate-pulse" />
      </div>
      <div className="item-list-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            key={i}
            className="aspect-[3/4] rounded-xl bg-[var(--surface)] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
