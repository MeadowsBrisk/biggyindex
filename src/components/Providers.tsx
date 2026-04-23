"use client";

import { Provider } from "jotai";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export function JotaiProvider({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <Provider>{children}</Provider>
    </NuqsAdapter>
  );
}
