export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-4">
      <div className="h-8 w-40 rounded bg-[var(--surface)] animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            key={i}
            className="h-24 rounded-xl bg-[var(--surface)] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
