#!/usr/bin/env tsx
/**
 * Build per-locale message JSON files from the unified master YAML.
 *
 * Source:  src/messages/messages.yaml
 * Output:  src/messages/<locale>/index.json  (one file per locale in $locales)
 *
 * Master YAML shape:
 *   $locales:              # list of locales to emit
 *     - en-GB
 *     - de-DE
 *     ...
 *   key.path:
 *     leaf:
 *       en-GB: ...         # map leaf: per-locale strings
 *       de-DE: ...
 *     otherLeaf: string    # string leaf: shorthand for { en-GB: string }
 *
 * Missing per-locale values fall back to `en-GB`. If en-GB is missing for a
 * leaf, the build fails.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src/messages/messages.yaml");
const OUT_DIR = resolve(ROOT, "src/messages");

const FALLBACK = "en-GB";

type LocaleMap = Record<string, string>;
type Node = string | LocaleMap | { [k: string]: Node };

function isLocaleMap(v: unknown): v is LocaleMap {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  // A locale map has every value as a string and every key looks like a locale.
  return Object.entries(obj).every(
    ([k, val]) => /^[a-z]{2}(?:-[A-Z]{2})?$/.test(k) && typeof val === "string",
  );
}

function resolveTree(node: Node, locale: string, path: string[]): unknown {
  if (typeof node === "string") {
    // String shorthand — only en-GB, others fall back.
    return node;
  }
  if (isLocaleMap(node)) {
    const value = node[locale] ?? node[FALLBACK];
    if (value == null) {
      throw new Error(
        `[build-messages] Missing ${FALLBACK} for key "${path.join(".")}"`,
      );
    }
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, Node>)) {
    out[k] = resolveTree(v, locale, [...path, k]);
  }
  return out;
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`[build-messages] Master YAML not found: ${SRC}`);
    process.exit(1);
  }

  const raw = readFileSync(SRC, "utf8");
  const doc = YAML.parse(raw) as Record<string, Node>;

  const locales = doc.$locales as unknown as string[] | undefined;
  if (!Array.isArray(locales) || locales.length === 0) {
    console.error("[build-messages] Master YAML must define $locales (array).");
    process.exit(1);
  }
  if (!locales.includes(FALLBACK)) {
    console.error(
      `[build-messages] $locales must include "${FALLBACK}" (fallback).`,
    );
    process.exit(1);
  }

  const tree: Record<string, Node> = { ...doc };
  delete tree.$locales;

  let totalKeys = 0;
  for (const locale of locales) {
    const resolved = resolveTree(tree as Node, locale, []) as Record<
      string,
      unknown
    >;
    const outPath = resolve(OUT_DIR, locale, "index.json");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
    const count = countLeaves(resolved);
    if (locale === FALLBACK) totalKeys = count;
    console.log(`  ✓ ${locale.padEnd(7)} → ${outPath.replace(ROOT, ".")}`);
  }

  console.log(
    `\n[build-messages] Wrote ${locales.length} locales × ${totalKeys} keys.`,
  );
}

function countLeaves(obj: unknown): number {
  if (typeof obj === "string") return 1;
  if (typeof obj !== "object" || obj === null) return 0;
  let n = 0;
  for (const v of Object.values(obj)) n += countLeaves(v);
  return n;
}

main();
