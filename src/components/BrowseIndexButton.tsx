import React from 'react';
import Link from 'next/link';

interface BrowseIndexButtonProps {
  label: string;
  className?: string;
}

export default function BrowseIndexButton({ label, className = '' }: BrowseIndexButtonProps) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2 text-sm font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-5 py-2.5 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300 ${className}`}
    >
      <span className="inline-block text-lg leading-none translate-x-0 transition-transform duration-300 ease-out group-hover:-translate-x-1">←</span>
      <span>{label}</span>
    </Link>
  );
}
