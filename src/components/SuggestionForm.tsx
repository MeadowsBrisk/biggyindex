"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SuggestibleField } from "@/lib/suggestion-fields";
import { getSuggestibleFields, readItemField } from "@/lib/suggestion-fields";

const API_BASE = process.env.NEXT_PUBLIC_SUGGESTIONS_API ?? "";

interface Props {
  refNum: string;
  itemName: string;
  sellerName?: string;
  item: Record<string, unknown>;
}

interface PendingSuggestion {
  id: string;
  field: string;
  current_val: string;
  suggested_val: string;
  votes: number;
}

interface StagedEdit {
  field: SuggestibleField;
  currentValue: string[] | null;
  values: string[];
}

export function SuggestionForm({ refNum, itemName, sellerName, item }: Props) {
  const t = useTranslations("suggest.form");
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [staged, setStaged] = useState<StagedEdit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [pending, setPending] = useState<PendingSuggestion[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  // Effective category: if user staged a category change, use that; otherwise item.c
  const stagedCategory = staged.find((s) => s.field.key === "category");
  const effectiveCategory = stagedCategory
    ? stagedCategory.values[0]
    : ((item.c as string | undefined) ?? null);

  // Recompute fields whenever effective category changes
  const fields = useMemo(
    () => getSuggestibleFields(effectiveCategory),
    [effectiveCategory],
  );

  const fieldDef = fields.find((f) => f.key === selectedField);
  const currentValue = fieldDef
    ? readItemField(item, fieldDef.itemField)
    : null;

  const stagedKeys = new Set(staged.map((s) => s.field.key));

  // Load pending suggestions for this item
  useEffect(() => {
    if (!API_BASE) return;
    fetch(
      `${API_BASE}/suggestions?refNum=${encodeURIComponent(refNum)}&status=pending`,
    )
      .then((r) => r.json())
      .then((data: { suggestions?: PendingSuggestion[] }) => {
        if (data.suggestions) setPending(data.suggestions);
      })
      .catch(() => {});
  }, [refNum]);

  function handleFieldSelect(key: string) {
    setSelectedField(key);
    setSelectedValues([]);
    setResult(null);
  }

  function toggleValue(val: string) {
    setSelectedValues((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    );
  }

  function setSingleValue(val: string) {
    setSelectedValues([val]);
  }

  const isFlag = fieldDef?.inputType === "flag";
  const effectiveValues = isFlag ? ["true"] : selectedValues;

  const hasChanged =
    isFlag ||
    (effectiveValues.length > 0 &&
      JSON.stringify([...effectiveValues].sort()) !==
        JSON.stringify([...(currentValue ?? [])].sort()));

  function addToStaged() {
    if (!fieldDef || !hasChanged) return;

    // If adding a category change, clear any subcategory/attribute edits that
    // belong to the OLD category (they'll be stale now)
    if (fieldDef.key === "category") {
      const validKeys = new Set(
        getSuggestibleFields(effectiveValues[0]).map((f) => f.key),
      );
      setStaged((prev) => [
        ...prev.filter((s) => validKeys.has(s.field.key)),
        { field: fieldDef, currentValue, values: effectiveValues },
      ]);
    } else {
      setStaged((prev) => [
        ...prev,
        { field: fieldDef, currentValue, values: effectiveValues },
      ]);
    }
    setSelectedField(null);
    setSelectedValues([]);
  }

  function removeStaged(key: string) {
    setStaged((prev) => {
      const next = prev.filter((s) => s.field.key !== key);
      // If removing the category change, also clear subcategory/attribute edits
      // that only applied to the staged category
      if (key === "category") {
        const originalCat = (item.c as string | undefined) ?? null;
        const validKeys = new Set(
          getSuggestibleFields(originalCat).map((f) => f.key),
        );
        return next.filter((s) => validKeys.has(s.field.key));
      }
      return next;
    });
  }

  const handleSubmitAll = useCallback(async () => {
    if (staged.length === 0) return;
    setSubmitting(true);
    setResult(null);

    let successCount = 0;
    let lastError = "";

    for (const edit of staged) {
      try {
        const suggestedValue =
          edit.field.inputType === "single" || edit.field.inputType === "flag"
            ? edit.values[0]
            : edit.values;

        const res = await fetch(`${API_BASE}/suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refNum,
            itemName,
            sellerName,
            field: edit.field.key,
            currentValue: edit.currentValue ?? null,
            suggestedValue,
          }),
        });
        const data = (await res.json()) as { message?: string; error?: string };
        if (res.ok) {
          successCount++;
        } else {
          lastError = data.error || t("somethingWentWrong");
        }
      } catch {
        lastError = t("networkError");
      }
    }

    if (successCount === staged.length) {
      setResult({
        ok: true,
        message:
          staged.length === 1
            ? t("suggestionSubmitted")
            : t("allSubmitted", { count: staged.length }),
      });
    } else if (successCount > 0) {
      setResult({
        ok: true,
        message: t("partialSubmitted", {
          successCount,
          totalCount: staged.length,
          error: lastError,
        }),
      });
    } else {
      setResult({ ok: false, message: lastError || t("somethingWentWrong") });
    }

    setStaged([]);
    setSubmitting(false);

    // Refresh pending
    try {
      const updated = (await fetch(
        `${API_BASE}/suggestions?refNum=${encodeURIComponent(refNum)}&status=pending`,
      ).then((r) => r.json())) as { suggestions?: PendingSuggestion[] };
      if (updated.suggestions) setPending(updated.suggestions);
    } catch {
      // silent
    }
  }, [staged, refNum, itemName, sellerName, t]);

  async function handleVote(suggestionId: string) {
    try {
      const res = await fetch(`${API_BASE}/suggestions/${suggestionId}/vote`, {
        method: "POST",
      });
      if (res.ok) {
        setVotedIds((prev) => new Set(prev).add(suggestionId));
        const data = (await res.json()) as { votes?: number };
        setPending((prev) =>
          prev.map((s) =>
            s.id === suggestionId
              ? { ...s, votes: data.votes ?? s.votes + 1 }
              : s,
          ),
        );
      }
    } catch {
      // silent
    }
  }

  const canAdd = fieldDef && hasChanged;
  const availableFields = fields.filter((f) => !stagedKeys.has(f.key));

  function fieldLabel(key: string): string {
    switch (key) {
      case "category":
        return t("fields.category");
      case "subcategories":
        return t("fields.subcategories");
      case "tier":
        return t("fields.tier");
      case "micron":
        return t("fields.micron");
      case "wrongProduct":
        return t("fields.wrongProduct");
      default:
        return fields.find((f) => f.key === key)?.label ?? key;
    }
  }

  return (
    <div className="space-y-6">
      {/* Staged edits queue */}
      {staged.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t("stagedEdits", { count: staged.length })}
          </h3>
          {staged.map((edit) => (
            <div
              key={edit.field.key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium text-foreground">
                  {fieldLabel(edit.field.key)}:
                </span>{" "}
                {edit.currentValue && (
                  <>
                    <span className="text-muted line-through">
                      {edit.currentValue.join(", ")}
                    </span>
                    {" → "}
                  </>
                )}
                <span className="text-primary font-medium">
                  {edit.values.join(", ")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeStaged(edit.field.key)}
                className="shrink-0 text-muted hover:text-foreground text-xs cursor-pointer"
                title={t("removeEdit")}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Field picker */}
      {availableFields.length > 0 && !result && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            {staged.length > 0
              ? t("addAnotherCorrection")
              : t("whatNeedsFixing")}
          </h2>
          <div className="flex flex-col gap-1.5">
            {availableFields.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => handleFieldSelect(f.key)}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
                  selectedField === f.key
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-surface text-foreground hover:border-primary/40"
                }`}
              >
                {fieldLabel(f.key)}
                {f.key === "wrongProduct" && (
                  <span className="text-xs text-muted">
                    {t("wrongProductHint")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Value picker — pill style */}
      {fieldDef && fieldDef.inputType !== "flag" && (
        <div className="space-y-3">
          {currentValue && currentValue.length > 0 && (
            <div className="rounded-md bg-foreground/5 px-3 py-2 text-sm">
              <span className="font-semibold">{t("currently")}</span>{" "}
              {currentValue.join(", ")}
            </div>
          )}
          {!currentValue && (
            <div className="rounded-md bg-foreground/5 px-3 py-2 text-sm text-muted">
              {t("currently")} <em>{t("notSet")}</em>
            </div>
          )}

          <h3 className="text-sm font-semibold text-foreground">
            {t("shouldBe")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {fieldDef.options?.map((opt) => {
              const isSelected = selectedValues.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    fieldDef.inputType === "single"
                      ? setSingleValue(opt)
                      : toggleValue(opt)
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-foreground hover:border-primary/40"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Flag: wrong product */}
      {fieldDef && fieldDef.inputType === "flag" && (
        <div className="text-sm text-muted leading-relaxed">
          {t("wrongProductDescription")}
        </div>
      )}

      {/* Add button */}
      {fieldDef && !result && (
        <button
          type="button"
          disabled={!canAdd}
          onClick={addToStaged}
          className="inline-flex items-center rounded-lg border border-dashed border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
        >
          {staged.length > 0 ? t("addThisEdit") : t("addEdit")}
        </button>
      )}

      {/* Submit all */}
      {staged.length > 0 && !result && (
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmitAll}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {submitting
            ? t("submitting")
            : staged.length === 1
              ? t("submitSuggestion")
              : t("submitSuggestions", { count: staged.length })}
        </button>
      )}

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
              : "border-red-500/30 bg-red-500/10 text-red-600"
          }`}
        >
          {result.message}
          {result.ok && (
            <button
              type="button"
              onClick={() => {
                setSelectedField(null);
                setSelectedValues([]);
                setResult(null);
              }}
              className="ml-3 text-xs font-medium underline underline-offset-2 hover:no-underline cursor-pointer"
            >
              {t("suggestMoreEdits")}
            </button>
          )}
        </div>
      )}

      {/* Pending suggestions from other users */}
      {pending.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("pendingSuggestions", { count: pending.length })}
          </h3>
          {pending.map((s) => {
            const voted = votedIds.has(s.id);
            let display: string;
            try {
              const val = JSON.parse(s.suggested_val);
              display = Array.isArray(val) ? val.join(", ") : String(val);
            } catch {
              display = s.suggested_val;
            }
            let currentDisplay: string | null = null;
            try {
              if (s.current_val) {
                const cv = JSON.parse(s.current_val);
                currentDisplay =
                  cv === null
                    ? null
                    : Array.isArray(cv)
                      ? cv.join(", ")
                      : String(cv);
              }
            } catch {
              currentDisplay = s.current_val;
            }

            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-foreground">
                    {fieldLabel(s.field)}:
                  </span>{" "}
                  {currentDisplay && (
                    <>
                      <span className="text-muted line-through">
                        {currentDisplay}
                      </span>
                      {" → "}
                    </>
                  )}
                  <span className="text-primary font-medium">{display}</span>
                </div>
                <button
                  type="button"
                  disabled={voted}
                  onClick={() => handleVote(s.id)}
                  title={voted ? t("alreadyVoted") : t("upvoteSuggestion")}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    voted
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-muted hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  👍 {s.votes}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
