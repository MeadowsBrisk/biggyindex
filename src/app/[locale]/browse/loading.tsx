export default function Loading() {
  return (
    <div className="mx-auto p-4">
      <div className="h-4 w-64 mb-6 rounded bg-[var(--surface)] animate-pulse" />
      <div className="flex gap-0">
        <div className="hidden md:block w-64 shrink-0 pr-4">
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
        <div className="flex-1 min-w-0 pl-4">
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
    </div>
  );
}
