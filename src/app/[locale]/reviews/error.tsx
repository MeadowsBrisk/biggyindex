"use client";

import { useEffect } from "react";

export default function ReviewsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BiggyIndex] Reviews error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-bold text-foreground">
        Failed to load reviews
      </h2>
      <p className="max-w-md text-sm text-muted">
        We couldn&apos;t load the reviews page. This is usually temporary.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
      >
        Retry
      </button>
    </div>
  );
}
