import { log } from '../../shared/logging/logger';

// Azure Translator API types
export interface TranslationResult {
  detectedLanguage?: { language: string; score: number };
  translations: { text: string; to: string }[];
}

export interface TranslateBatchResult {
  results: TranslationResult[];
  charCount: number;
}

// Target locales (excluding en-GB which is source)
export const TARGET_LOCALES = ['de', 'fr', 'pt', 'it'] as const;
export type TargetLocale = typeof TARGET_LOCALES[number];

// Retry configuration for rate limiting
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 2000; // Start with 2 second delay

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Map Azure language codes to our locale format
export function azureCodeToLocale(code: string): string {
  const map: Record<string, string> = {
    'de': 'de-DE',
    'fr': 'fr-FR',
    'pt': 'pt-PT',
    'it': 'it-IT',
  };
  return map[code] || code;
}

/**
 * Translate a batch of texts to all target locales in a single API call.
 * Azure supports up to 25 texts × 50,000 chars per request.
 */
export async function translateBatch(
  texts: string[],
  locales: readonly string[] = TARGET_LOCALES
): Promise<TranslateBatchResult> {
  const endpoint = process.env.TRANSLATOR_ENDPOINT;
  const key = process.env.TRANSLATOR_KEY;
  const region = process.env.TRANSLATOR_REGION;

  if (!endpoint || !key || !region) {
    throw new Error('Missing Azure Translator credentials. Set TRANSLATOR_ENDPOINT, TRANSLATOR_KEY, TRANSLATOR_REGION');
  }

  if (texts.length === 0) {
    return { results: [], charCount: 0 };
  }

  if (texts.length > 25) {
    throw new Error(`Batch size ${texts.length} exceeds Azure limit of 25`);
  }

  // Build request body
  const body = texts.map(text => ({ Text: text }));
  
  // Build URL with target locales
  const toParams = locales.map(l => `to=${l}`).join('&');
  const url = `${endpoint}/translate?api-version=3.0&${toParams}`;

  const charCount = texts.reduce((sum, t) => sum + t.length, 0) * locales.length;

  try {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        
        // Azure returns array directly (not wrapped in 'value' for translate endpoint)
        const results: TranslationResult[] = Array.isArray(data) ? data : (data.value || []);

        return { results, charCount };
      }

      const errorText = await res.text();
      
      // Handle rate limiting (429) with retry
      if (res.status === 429) {
        const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        log.translate.warn(`Rate limited (429), retrying in ${delayMs}ms`, { attempt, maxRetries: MAX_RETRIES });
        
        if (attempt < MAX_RETRIES) {
          await sleep(delayMs);
          continue;
        }
        // Final attempt failed
        throw new Error(`RATE_LIMITED: Max retries (${MAX_RETRIES}) exceeded - ${res.status} - ${errorText}`);
      }
      
      // Check for quota exceeded (free tier monthly limit)
      if (res.status === 403 || errorText.includes('quota') || errorText.includes('limit')) {
        throw new Error(`QUOTA_EXCEEDED: ${res.status} - ${errorText}`);
      }
      
      throw new Error(`Azure Translator error: ${res.status} - ${errorText}`);
    }

    throw lastError || new Error('Unknown error after retries');
  } catch (e: any) {
    log.translate.error('Azure API call failed', { error: e.message, textCount: texts.length });
    throw e;
  }
}

/**
 * Parse a translated text that was combined as "name\n\ndescription"
 */
export function parseTranslatedText(text: string): { name: string; description: string } {
  const parts = text.split('\n\n');
  const name = parts[0] || '';
  const description = parts.slice(1).join('\n\n');
  return { name, description };
}
