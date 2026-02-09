"use client";

import React from "react";
import { useTranslations } from "next-intl";
import BrowseIndexButton from "@/components/actions/BrowseIndexButton";

/**
 * Reusable sticky header for slug pages (item, seller, category).
 * Contains: Browse Index button. Theme toggle is handled by global FixedControls.
 */
export default function SlugPageHeader() {
  const tOv = useTranslations("Overlay");

  return (
    <div className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 py-3">
      <div className="w-full max-w-[1800px] mx-auto px-4 md:px-6 lg:px-8">
        <BrowseIndexButton
          label={tOv("browseIndex") || "Browse Index"}
        />
      </div>
    </div>
  );
}
