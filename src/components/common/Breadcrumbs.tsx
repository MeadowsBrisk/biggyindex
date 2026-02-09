"use client";

import Link from "next/link";
import type { ReactElement } from "react";

export interface Crumb {
  /** Visible label text */
  label: string;
  /** Link target; omit for the current (last) crumb */
  href?: string;
}

interface BreadcrumbsProps {
  crumbs: Crumb[];
}

/**
 * Visual breadcrumb trail for slug pages (item, seller, category).
 * The last crumb is rendered as plain text (current page).
 */
export default function Breadcrumbs({ crumbs }: BreadcrumbsProps): ReactElement {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto max-w-5xl px-4 pt-4 pb-2 sm:px-6"
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg
                  viewBox="0 0 6 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="h-3 w-3 shrink-0 opacity-40"
                  aria-hidden
                >
                  <path d="M1 1l4 4-4 4" />
                </svg>
              )}
              {isLast || !crumb.href ? (
                <span className="truncate max-w-[200px] font-medium text-slate-700 dark:text-slate-300">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate max-w-[200px] transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
