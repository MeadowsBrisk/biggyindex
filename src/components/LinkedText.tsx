import type { ReactNode } from "react";
import { decodeEntities } from "@/lib/format";
import { normalizeLittleBiggyUrl } from "@/lib/tracking/littlebiggy";

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?"]);

interface LinkedTextProps {
  text: string;
  className?: string;
  linkClassName?: string;
}

function splitTrailingPunctuation(rawUrl: string): {
  url: string;
  suffix: string;
} {
  let url = rawUrl;
  let suffix = "";

  while (url.length > 0) {
    const last = url.charAt(url.length - 1);
    const hasUnbalancedClosingParen =
      last === ")" &&
      (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0);

    if (!TRAILING_PUNCTUATION.has(last) && !hasUnbalancedClosingParen) break;

    suffix = last + suffix;
    url = url.slice(0, -1);
  }

  return { url, suffix };
}

function toHref(rawUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `https://${rawUrl}`;
  return normalizeLittleBiggyUrl(withProtocol);
}

export function LinkedText({
  text,
  className,
  linkClassName = "font-medium text-primary underline underline-offset-2 hover:opacity-80 break-all",
}: LinkedTextProps) {
  const decoded = decodeEntities(text);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of decoded.matchAll(URL_RE)) {
    const rawMatch = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) nodes.push(decoded.slice(lastIndex, index));

    const { url, suffix } = splitTrailingPunctuation(rawMatch);
    nodes.push(
      <a
        key={`${url}-${index}`}
        href={toHref(url)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {url}
      </a>,
    );
    if (suffix) nodes.push(suffix);

    lastIndex = index + rawMatch.length;
  }

  if (lastIndex < decoded.length) nodes.push(decoded.slice(lastIndex));

  return (
    <span className={className}>{nodes.length > 0 ? nodes : decoded}</span>
  );
}
