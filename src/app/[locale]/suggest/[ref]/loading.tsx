export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
      <div className="h-7 w-48 rounded bg-[var(--surface)] animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            key={i}
            className="h-20 rounded-xl bg-[var(--surface)] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
