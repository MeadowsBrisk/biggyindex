import { SiteHeader } from "@/components/SiteHeader";

/**
 * Browse loading state. Renders the real <SiteHeader> so the header (and, on
 * mobile, the just-closed menu) stays put through the navigation instead of
 * blinking out and back — the page is rendered per-route (no shared layout),
 * so a headerless skeleton would flash the chrome. A toolbar-height placeholder
 * keeps the grid from jumping when the real toolbar mounts.
 */
export default function Loading() {
  return (
    <>
      <SiteHeader />

      {/* Toolbar placeholder — matches the sticky toolbar height. */}
      <div className="border-b border-[var(--border)]">
        <div className="mx-auto flex items-center gap-2 px-4 py-2.5">
          <div className="h-8 w-24 rounded-lg bg-[var(--surface)] animate-pulse" />
          <div className="h-8 w-32 rounded-lg bg-[var(--surface)] animate-pulse" />
          <div className="ml-auto h-8 w-40 rounded-lg bg-[var(--surface)] animate-pulse" />
        </div>
      </div>

      <main className="mx-auto px-4">
        <div className="flex gap-0">
          {/* Sidebar (desktop) */}
          <div className="hidden md:block w-64 shrink-0 pr-4 py-4">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  key={i}
                  className="h-9 rounded-lg bg-[var(--surface)] animate-pulse"
                />
              ))}
            </div>
          </div>

          {/* Card grid */}
          <div className="flex-1 min-w-0 py-4 md:pl-4">
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  key={i}
                  className="aspect-square rounded-xl bg-[var(--surface)] animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
