"use client";

import { useEffect } from "react";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BiggyIndex] Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] px-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted">
        An unexpected error occurred. This has been logged automatically.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
