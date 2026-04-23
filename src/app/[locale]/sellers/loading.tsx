export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="h-8 w-40 rounded bg-[var(--surface)] animate-pulse" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            key={i}
            className="h-72 rounded-xl bg-[var(--surface)] animate-pulse"
          />
        ))}
      </div>
      <div className="h-[40rem] rounded-xl bg-[var(--surface)] animate-pulse" />
    </div>
  );
}
