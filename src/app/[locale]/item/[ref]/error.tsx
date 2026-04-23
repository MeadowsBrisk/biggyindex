"use client";

import { useEffect } from "react";

export default function ItemDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BiggyIndex] Item detail error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-bold text-foreground">
        Item not available
      </h2>
      <p className="max-w-md text-sm text-muted">
        We couldn&apos;t load this item. It may have been removed or there was a
        temporary error.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
        >
          Retry
        </button>
        <a
          href="/browse"
          className="rounded-lg border border-[var(--border)] px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[var(--surface-hover)]"
        >
          Browse items
        </a>
      </div>
    </div>
  );
}
