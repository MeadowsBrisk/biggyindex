// Background function that runs translation stage once daily
// Should run AFTER items crawler has completed to ensure full descriptions are available
// Uses unified-crawler translation stage with budget tracking

import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { getBlobClient } from "../../scripts/unified-crawler/shared/persistence/blobs";
import { runTranslate } from "../../scripts/unified-crawler/stages/translate/run";
import { checkBudget, MONTHLY_CHAR_BUDGET } from "../../scripts/unified-crawler/stages/translate/budget";
import { appendRunMeta } from "../../scripts/unified-crawler/shared/persistence/runMeta";

const since = (t0: number) => Math.round((Date.now() - t0) / 1000);

export const handler: Handler = async (event) => {
    const started = Date.now();
    const log = (m: string) => console.log(`[translate-background] ${m}`);
    const warn = (m: string) => console.warn(`[translate-background] ${m}`);
    const errlog = (m: string) => console.error(`[translate-background] ${m}`);

    try {
        log("start");

        // Ensure persistence defaults for Netlify runtime
        if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "blobs";

        const env = loadEnv();
        const sharedBlob = getBlobClient(env.stores.shared);

        // Check budget before starting
        const { allowed, remaining, budget } = await checkBudget(sharedBlob);
        const percentUsed = ((budget.charsUsed / MONTHLY_CHAR_BUDGET) * 100).toFixed(1);

        log(`budget status: ${budget.charsUsed.toLocaleString()}/${MONTHLY_CHAR_BUDGET.toLocaleString()} chars (${percentUsed}% used, ${remaining.toLocaleString()} remaining)`);

        if (!allowed) {
            log("monthly budget exhausted - skipping translation run");
            return {
                statusCode: 200,
                body: JSON.stringify({
                    ok: true,
                    skipped: true,
                    reason: "budget_exhausted",
                    budget: {
                        month: budget.month,
                        used: budget.charsUsed,
                        remaining: 0,
                    },
                    elapsed: since(started),
                }),
            } as any;
        }

        // Run translation stage
        // Use conservative rate limiting for background function (60s delay)
        // Don't set a limit - process all pending items until budget exhausted or done
        log("running translation stage (type=all)");
        const result = await runTranslate({
            batchDelayMs: 60000, // 60s between batches for rate limiting
            type: 'all',
        });

        const elapsed = since(started);

        log(`completed: translated=${result.translated} chars=${result.charCount.toLocaleString()} errors=${result.errors?.length || 0} budgetExhausted=${result.budgetExhausted}`);

        // Append run meta to shared store (best-effort)
        try {
            await appendRunMeta(env.stores.shared, `run-meta/translate.json`, {
                scope: "translate",
                counts: {
                    translated: result.translated,
                    charCount: result.charCount,
                    errors: result.errors?.length || 0,
                },
                notes: {
                    budgetExhausted: result.budgetExhausted,
                    budgetRemaining: remaining - result.charCount,
                },
            });
        } catch (e: any) {
            warn(`failed to append run meta: ${e?.message || e}`);
        }

        // Log final summary explicitly for user visibility
        log(`SUMMARY: translated=${result.translated} chars=${result.charCount.toLocaleString()} errors=${result.errors?.length || 0}`);
        log(`BUDGET:Exhausted=${result.budgetExhausted} Remaining=${(remaining - result.charCount).toLocaleString()}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: result.ok,
                translated: result.translated,
                charCount: result.charCount,
                budgetExhausted: result.budgetExhausted,
                errors: result.errors?.length || 0,
                elapsed,
            }),
        } as any;
    } catch (e: any) {
        errlog(`fatal: ${e?.stack || e?.message || String(e)}`);
        return { statusCode: 500, body: "error" } as any;
    }
};

export default handler;
