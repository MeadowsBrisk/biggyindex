#!/usr/bin/env tsx
/**
 * Fill missing locale entries in src/messages/messages.yaml via Microsoft Translator.
 *
 * Examples:
 *   yarn i18n:translate --locale de-DE --missing-only --dry-run
 *   yarn i18n:translate --all --missing-only
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML, { isMap, isScalar, isSeq } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src/messages/messages.yaml");
const REPORT_DIR = resolve(ROOT, ".translation-reports");

const FALLBACK_LOCALE = "en-GB";
const ENGLISH_LOCALES = new Set(["en-GB", "en-IE"]);
const DEFAULT_ENDPOINT = "https://api.cognitive.microsofttranslator.com";
const API_VERSION = "3.0";
const DEFAULT_BATCH_SIZE = 50;
const MAX_TRANSLATOR_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000];
const TRANSIENT_TRANSLATOR_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const TRANSLATOR_TARGETS: Record<string, string> = {
  "de-DE": "de",
  "fr-FR": "fr",
  "pt-PT": "pt-pt",
  "it-IT": "it",
  "es-ES": "es",
  "el-GR": "el",
  "cs-CZ": "cs",
  "pl-PL": "pl",
};

const BRAND_TOKENS = [
  "Biggy Index",
  "BiggyIndex",
  "Little Biggy",
  "LittleBiggy",
] as const;

const PLACEHOLDER_RE = /\{[A-Za-z_][\w.-]*\}/g;
const URL_RE = /https?:\/\/[^\s)]+/g;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const CURRENCY_RE = /[£€$]\s?\d+(?:[.,]\d+)?/g;
const CURRENCY_UNIT_RE = /[£€$]\/[A-Za-z]+/g;
const LOCALE_RE = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const ICU_SELECTOR_RE = /\{[^}]*,\s*(?:plural|select)\s*,/;
const translationCache = new Map<string, string>();

interface CliOptions {
  dryRun: boolean;
  overwrite: boolean;
  includeIcu: boolean;
  locales: string[];
  endpoint: string;
  batchSize: number;
}

interface Candidate {
  path: string;
  sourceText: string;
  existingText?: string;
  setTranslation: (value: string) => void;
}

interface LocaleReport {
  locale: string;
  translatorTarget: string;
  planned: number;
  added: number;
  changed: number;
  skippedExisting: number;
  skippedEmpty: number;
  skippedIcu: number;
  skippedProtectedOnly: number;
  failures: string[];
  examples: Array<{ path: string; source: string }>;
}

interface RunReport {
  createdAt: string;
  dryRun: boolean;
  overwrite: boolean;
  includeIcu: boolean;
  locales: LocaleReport[];
}

interface ProtectedText {
  text: string;
  replacements: Array<{ token: string; value: string }>;
}

interface AzureTranslation {
  text: string;
  to: string;
}

interface AzureTranslationRow {
  translations?: AzureTranslation[];
}

type YamlPair = {
  key: unknown;
  value: unknown;
};

type YamlMapNode = {
  items: YamlPair[];
  get: (key: string, keepScalar?: boolean) => unknown;
  set: (key: string, value: unknown) => void;
};

function usage(): string {
  return `Usage:
  yarn i18n:translate --locale de-DE --missing-only --dry-run
  yarn i18n:translate --all --missing-only

Options:
  --locale <locale>   Translate one locale, e.g. de-DE
  --all               Translate all non-English locales listed in $locales
  --missing-only      Skip locale values that already exist (default behavior)
  --overwrite         Replace existing locale values
  --dry-run           Report planned work without calling Azure or writing files
  --include-icu       Allow ICU plural/select strings through the translator
  --endpoint <url>    Override AZURE_TRANSLATOR_ENDPOINT / TRANSLATOR_ENDPOINT
  --batch-size <n>    Max Azure texts per request (default: 50)
  --help              Show this help
`;
}

function parseArgs(argv: string[]): CliOptions {
  let locale: string | undefined;
  let all = false;
  let dryRun = false;
  let overwrite = false;
  let missingOnly = false;
  let includeIcu = false;
  let endpoint = translatorEndpoint();
  let batchSize = DEFAULT_BATCH_SIZE;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    switch (arg) {
      case "--locale":
        locale = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--all":
        all = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--overwrite":
        overwrite = true;
        break;
      case "--missing-only":
        missingOnly = true;
        break;
      case "--include-icu":
        includeIcu = true;
        break;
      case "--endpoint":
        endpoint = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--batch-size":
        batchSize = Number(requireValue(argv, i, arg));
        i += 1;
        break;
      default:
        throw new Error(
          `[i18n:translate] Unknown option: ${arg}\n\n${usage()}`,
        );
    }
  }

  if (locale && all) {
    throw new Error("[i18n:translate] Use either --locale or --all, not both.");
  }
  if (!locale && !all) {
    throw new Error("[i18n:translate] Provide --locale <locale> or --all.");
  }
  if (overwrite && missingOnly) {
    throw new Error(
      "[i18n:translate] --overwrite conflicts with --missing-only.",
    );
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error(
      "[i18n:translate] --batch-size must be an integer from 1 to 100.",
    );
  }

  return {
    dryRun,
    overwrite,
    includeIcu,
    locales: locale ? [locale] : [],
    endpoint,
    batchSize,
  };
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`[i18n:translate] ${flag} requires a value.`);
  }
  return value;
}

function loadEnvFiles() {
  const originalEnvKeys = new Set(Object.keys(process.env));
  const envFiles = [
    resolve(ROOT, "..", ".env"),
    resolve(ROOT, "..", ".env.local"),
    resolve(ROOT, "..", "dashboard", ".env"),
    resolve(ROOT, "..", "dashboard", ".env.local"),
    resolve(ROOT, ".env"),
    resolve(ROOT, ".env.local"),
  ];

  for (const path of envFiles) {
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const withoutExport = line.startsWith("export ")
        ? line.slice("export ".length).trim()
        : line;
      const separator = withoutExport.indexOf("=");
      if (separator === -1) continue;

      const key = withoutExport.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || originalEnvKeys.has(key)) {
        continue;
      }

      const value = parseEnvValue(withoutExport.slice(separator + 1).trim());
      process.env[key] = value;
    }
  }
}

function parseEnvValue(rawValue: string): string {
  const quote = rawValue[0];
  if (
    rawValue.length >= 2 &&
    (quote === '"' || quote === "'") &&
    rawValue.endsWith(quote)
  ) {
    const unquoted = rawValue.slice(1, -1);
    return quote === '"'
      ? unquoted
          .replaceAll("\\n", "\n")
          .replaceAll("\\r", "\r")
          .replaceAll('\\"', '"')
          .replaceAll("\\\\", "\\")
      : unquoted;
  }
  return rawValue.replace(/\s+#.*$/, "");
}

function readLocales(doc: YAML.Document.Parsed): string[] {
  const localeNode = doc.get("$locales", true);
  const locales = Array.isArray(localeNode)
    ? localeNode
    : isSeq(localeNode)
      ? localeNode.items.map((item) => scalarString(item))
      : [];
  if (!Array.isArray(locales) || locales.length === 0) {
    throw new Error("[i18n:translate] messages.yaml must define $locales.");
  }
  if (!locales.includes(FALLBACK_LOCALE)) {
    throw new Error(
      `[i18n:translate] $locales must include ${FALLBACK_LOCALE}.`,
    );
  }
  return locales.filter(
    (locale): locale is string => typeof locale === "string",
  );
}

function targetLocales(
  options: CliOptions,
  availableLocales: string[],
): string[] {
  const requested =
    options.locales.length > 0
      ? options.locales
      : availableLocales.filter((locale) => !ENGLISH_LOCALES.has(locale));

  for (const locale of requested) {
    if (!availableLocales.includes(locale)) {
      throw new Error(`[i18n:translate] Locale ${locale} is not in $locales.`);
    }
    if (!TRANSLATOR_TARGETS[locale]) {
      throw new Error(
        `[i18n:translate] Locale ${locale} has no Microsoft Translator target mapping.`,
      );
    }
  }

  return requested;
}

function scalarString(node: unknown): string | undefined {
  if (typeof node === "string") return node;
  if (isScalar(node) && typeof node.value === "string") return node.value;
  return undefined;
}

function isLocaleMapNode(node: unknown): boolean {
  if (!isMap(node)) return false;
  const map = node as YamlMapNode;
  return (
    map.items.length > 0 &&
    map.items.every((pair) => {
      const key = scalarString(pair.key);
      return (
        key != null && LOCALE_RE.test(key) && scalarString(pair.value) != null
      );
    })
  );
}

function collectCandidates(
  doc: YAML.Document.Parsed,
  locale: string,
  overwrite: boolean,
): { candidates: Candidate[]; skippedExisting: number } {
  const candidates: Candidate[] = [];
  let skippedExisting = 0;

  function walk(node: unknown, path: string[], pair?: YamlPair) {
    const scalar = scalarString(node);
    if (scalar != null && pair) {
      candidates.push({
        path: path.join("."),
        sourceText: scalar,
        setTranslation(value) {
          pair.value = doc.createNode({
            [FALLBACK_LOCALE]: scalar,
            [locale]: value,
          });
        },
      });
      return;
    }

    if (!isMap(node)) return;
    const map = node as YamlMapNode;

    if (isLocaleMapNode(map)) {
      const sourceText = scalarString(map.get(FALLBACK_LOCALE));
      if (sourceText == null) {
        throw new Error(
          `[i18n:translate] Missing ${FALLBACK_LOCALE} for ${path.join(".")}.`,
        );
      }

      const existingText = scalarString(map.get(locale));
      if (existingText != null && !overwrite) {
        skippedExisting += 1;
        return;
      }

      candidates.push({
        path: path.join("."),
        sourceText,
        existingText,
        setTranslation(value) {
          map.set(locale, value);
        },
      });
      return;
    }

    for (const item of map.items) {
      const key = scalarString(item.key);
      if (!key || key === "$locales") continue;
      walk(item.value, [...path, key], item);
    }
  }

  walk(doc.contents, []);
  return { candidates, skippedExisting };
}

function classifyCandidate(
  candidate: Candidate,
  includeIcu: boolean,
): "translate" | "empty" | "icu" | "protectedOnly" {
  const source = candidate.sourceText.trim();
  if (!source) return "empty";
  if (!includeIcu && ICU_SELECTOR_RE.test(source)) return "icu";
  if (isProtectedOnly(source)) return "protectedOnly";
  return "translate";
}

function isProtectedOnly(source: string): boolean {
  let remaining = source;
  for (const brand of BRAND_TOKENS) {
    remaining = remaining.replaceAll(brand, "");
  }
  remaining = remaining
    .replace(PLACEHOLDER_RE, "")
    .replace(URL_RE, "")
    .replace(EMAIL_RE, "")
    .replace(CURRENCY_RE, "")
    .replace(CURRENCY_UNIT_RE, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return remaining.length === 0;
}

function protectText(source: string): ProtectedText {
  const replacements: ProtectedText["replacements"] = [];
  let text = source;

  function addReplacement(value: string): string {
    const token = `__BI_TOKEN_${replacements.length}__`;
    replacements.push({ token, value });
    return token;
  }

  for (const brand of BRAND_TOKENS) {
    text = text.replaceAll(brand, () => addReplacement(brand));
  }

  text = text
    .replace(URL_RE, (match) => addReplacement(match))
    .replace(EMAIL_RE, (match) => addReplacement(match))
    .replace(CURRENCY_RE, (match) => addReplacement(match))
    .replace(CURRENCY_UNIT_RE, (match) => addReplacement(match))
    .replace(PLACEHOLDER_RE, (match) => addReplacement(match));

  return { text, replacements };
}

function restoreText(translated: string, protectedText: ProtectedText): string {
  let restored = translated;
  for (const { token, value } of protectedText.replacements) {
    if (!restored.includes(token)) {
      throw new Error(`Translator response dropped protected token ${token}.`);
    }
    restored = restored.replaceAll(token, value);
  }
  return restored;
}

function azureConfig(options: CliOptions): {
  endpoint: string;
  key: string;
  region?: string;
} {
  const key = process.env.AZURE_TRANSLATOR_KEY ?? process.env.TRANSLATOR_KEY;
  if (!key) {
    throw new Error(
      "[i18n:translate] AZURE_TRANSLATOR_KEY or TRANSLATOR_KEY is required.",
    );
  }

  return {
    endpoint: options.endpoint.replace(/\/$/, ""),
    key,
    region:
      process.env.AZURE_TRANSLATOR_REGION ?? process.env.TRANSLATOR_REGION,
  };
}

function translatorEndpoint(): string {
  return (
    process.env.AZURE_TRANSLATOR_ENDPOINT ??
    process.env.TRANSLATOR_ENDPOINT ??
    DEFAULT_ENDPOINT
  );
}

function batchTexts(texts: string[], batchSize: number): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    const wouldOverflowSize = current.length >= batchSize;
    const wouldOverflowChars = currentChars + text.length > 45_000;
    if (current.length > 0 && (wouldOverflowSize || wouldOverflowChars)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

async function translateBatch(
  texts: string[],
  locale: string,
  options: CliOptions,
): Promise<string[]> {
  const config = azureConfig(options);
  const target = TRANSLATOR_TARGETS[locale];
  const url = new URL(`${config.endpoint}/translate`);
  url.searchParams.set("api-version", API_VERSION);
  url.searchParams.set("from", "en");
  url.searchParams.set("to", target);
  url.searchParams.set("textType", "plain");

  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": config.key,
  };
  if (config.region)
    baseHeaders["Ocp-Apim-Subscription-Region"] = config.region;

  const body = JSON.stringify(texts.map((Text) => ({ Text })));

  for (let attempt = 0; attempt < MAX_TRANSLATOR_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "X-ClientTraceId": crypto.randomUUID(),
      },
      body,
    });

    if (response.ok) {
      const json = (await response.json()) as AzureTranslationRow[];
      return json.map((row, index) => {
        const text = row.translations?.[0]?.text;
        if (!text) {
          throw new Error(
            `Microsoft Translator returned no text for batch index ${index}.`,
          );
        }
        return text;
      });
    }

    const responseText = await response.text();
    const message = `Microsoft Translator ${response.status} ${response.statusText}: ${responseText}`;
    const canRetry =
      TRANSIENT_TRANSLATOR_STATUSES.has(response.status) &&
      attempt < MAX_TRANSLATOR_ATTEMPTS - 1;
    if (!canRetry) throw new Error(message);

    await delay(translatorRetryDelay(response, attempt));
  }

  throw new Error("Microsoft Translator retry loop ended unexpectedly.");
}

function translatorRetryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(seconds * 1_000, 0);

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(retryAt - Date.now(), 0);
  }

  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function translateUniqueSources(
  sources: string[],
  locale: string,
  options: CliOptions,
): Promise<Map<string, string>> {
  const uniqueSources = [...new Set(sources)];
  const translations = new Map<string, string>();
  const missingSources: string[] = [];

  for (const source of uniqueSources) {
    const cacheKey = `${locale}\u0000${source}`;
    const cached = translationCache.get(cacheKey);
    if (cached != null) translations.set(source, cached);
    else missingSources.push(source);
  }

  const protectedBySource = new Map(
    missingSources.map((source) => [source, protectText(source)]),
  );
  const protectedTexts = missingSources.map(
    (source) => protectedBySource.get(source)?.text ?? source,
  );
  const translatedProtectedTexts: string[] = [];

  for (const batch of batchTexts(protectedTexts, options.batchSize)) {
    translatedProtectedTexts.push(
      ...(await translateBatch(batch, locale, options)),
    );
  }

  for (let index = 0; index < missingSources.length; index += 1) {
    const source = missingSources[index];
    const protectedText = protectedBySource.get(source);
    const translated = translatedProtectedTexts[index];
    if (!protectedText || translated == null) continue;
    const restored = restoreText(translated, protectedText);
    translationCache.set(`${locale}\u0000${source}`, restored);
    translations.set(source, restored);
  }

  return translations;
}

async function processLocale(
  doc: YAML.Document.Parsed,
  locale: string,
  options: CliOptions,
): Promise<LocaleReport> {
  const { candidates, skippedExisting } = collectCandidates(
    doc,
    locale,
    options.overwrite,
  );
  const report: LocaleReport = {
    locale,
    translatorTarget: TRANSLATOR_TARGETS[locale],
    planned: candidates.length,
    added: 0,
    changed: 0,
    skippedExisting,
    skippedEmpty: 0,
    skippedIcu: 0,
    skippedProtectedOnly: 0,
    failures: [],
    examples: [],
  };

  const toTranslate: Candidate[] = [];
  for (const candidate of candidates) {
    const classification = classifyCandidate(candidate, options.includeIcu);
    if (classification === "empty") report.skippedEmpty += 1;
    if (classification === "icu") report.skippedIcu += 1;
    if (classification === "protectedOnly") report.skippedProtectedOnly += 1;
    if (classification === "translate") {
      toTranslate.push(candidate);
      if (report.examples.length < 8) {
        report.examples.push({
          path: candidate.path,
          source: candidate.sourceText,
        });
      }
    }
  }

  if (options.dryRun || toTranslate.length === 0) return report;

  let translations: Map<string, string>;
  try {
    translations = await translateUniqueSources(
      toTranslate.map((candidate) => candidate.sourceText),
      locale,
      options,
    );
  } catch (error) {
    report.failures.push(
      error instanceof Error ? error.message : String(error),
    );
    return report;
  }

  for (const candidate of toTranslate) {
    const translated = translations.get(candidate.sourceText);
    if (translated == null) {
      report.failures.push(`Missing translated text for ${candidate.path}.`);
      continue;
    }
    candidate.setTranslation(translated);
    if (candidate.existingText == null) report.added += 1;
    else report.changed += 1;
  }

  return report;
}

function writeReport(report: RunReport): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = report.createdAt.replace(/[:.]/g, "-");
  const path = resolve(REPORT_DIR, `${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return path;
}

function printReport(report: RunReport, reportPath?: string) {
  console.log(
    `\n[i18n:translate] ${report.dryRun ? "Dry run" : "Run"} completed.`,
  );
  for (const locale of report.locales) {
    console.log(
      `  ${locale.locale}: planned ${locale.planned}, added ${locale.added}, changed ${locale.changed}, skipped existing ${locale.skippedExisting}, ICU ${locale.skippedIcu}, protected-only ${locale.skippedProtectedOnly}, empty ${locale.skippedEmpty}, failures ${locale.failures.length}`,
    );
    if (report.dryRun && locale.examples.length > 0) {
      for (const example of locale.examples.slice(0, 4)) {
        console.log(`    - ${example.path}: ${example.source}`);
      }
    }
    for (const failure of locale.failures) console.error(`    ! ${failure}`);
  }
  if (reportPath) console.log(`\n[i18n:translate] Report: ${reportPath}`);
}

async function main() {
  if (!existsSync(SRC)) {
    throw new Error(`[i18n:translate] Master YAML not found: ${SRC}`);
  }

  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  const raw = readFileSync(SRC, "utf8");
  const doc = YAML.parseDocument(raw, { keepSourceTokens: true });
  const availableLocales = readLocales(doc);
  const locales = targetLocales(options, availableLocales);

  const report: RunReport = {
    createdAt: new Date().toISOString(),
    dryRun: options.dryRun,
    overwrite: options.overwrite,
    includeIcu: options.includeIcu,
    locales: [],
  };

  for (const locale of locales) {
    report.locales.push(await processLocale(doc, locale, options));
  }

  const hasFailures = report.locales.some(
    (locale) => locale.failures.length > 0,
  );
  let reportPath: string | undefined;
  if (!options.dryRun) {
    if (!hasFailures)
      writeFileSync(SRC, doc.toString({ lineWidth: 0 }), "utf8");
    reportPath = writeReport(report);
  }

  printReport(report, reportPath);
  if (hasFailures) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
