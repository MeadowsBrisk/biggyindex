export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="h-7 w-2/3 rounded bg-[var(--surface)] animate-pulse" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="aspect-square rounded-xl bg-[var(--surface)] animate-pulse" />
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
