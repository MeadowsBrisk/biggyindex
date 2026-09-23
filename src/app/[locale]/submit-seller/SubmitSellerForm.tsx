"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";

const SUBMIT_API = process.env.NEXT_PUBLIC_SUGGESTIONS_API ?? "";
const NOTE_MAX = 300;
// Mirrors the Worker's extractSellerId so a bad link is caught before the round trip.
const SELLER_REF =
  /^\d{4,10}$|(?:viewSubject\/p|\/seller)\/\d{4,10}(?:[/?#]|$)/;

interface SubmitResult {
  ok: boolean;
  message: string;
}

const inputClass =
  "block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted";

export function SubmitSellerForm() {
  const t = useTranslations("seller.submit");
  const id = useId();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const sellerName = name.trim();
    const ref = link.trim();
    if (!sellerName && !ref) {
      setResult({ ok: false, message: t("needNameOrLink") });
      return;
    }
    if (ref && !SELLER_REF.test(ref)) {
      setResult({ ok: false, message: t("badLink") });
      return;
    }
    if (!SUBMIT_API) {
      setResult({ ok: false, message: t("endpointMissing") });
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${SUBMIT_API}/seller-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerName: sellerName || undefined,
          ...(/^\d+$/.test(ref)
            ? { sellerId: ref }
            : { url: ref || undefined }),
          note: note.trim() || undefined,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        duplicate?: boolean;
      };
      if (res.status === 429) {
        setResult({ ok: false, message: t("rateLimited") });
      } else if (res.status === 400) {
        setResult({ ok: false, message: t("needNameOrLink") });
      } else if (!res.ok) {
        setResult({ ok: false, message: t("error", { status: res.status }) });
      } else {
        setResult({
          ok: true,
          message: data.duplicate ? t("duplicate") : t("success"),
        });
        setName("");
        setLink("");
        setNote("");
      }
    } catch {
      setResult({ ok: false, message: t("networkError") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>
          {t("nameLabel")}
        </label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          maxLength={80}
          autoComplete="off"
          placeholder={t("namePlaceholder")}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${id}-link`} className={labelClass}>
          {t("linkLabel")}
        </label>
        <input
          id={`${id}-link`}
          type="text"
          inputMode="url"
          value={link}
          autoComplete="off"
          placeholder="https://littlebiggy.org/viewSubject/p/12345"
          aria-describedby={`${id}-link-hint`}
          onChange={(event) => setLink(event.target.value)}
          className={inputClass}
        />
        <p id={`${id}-link-hint`} className="mt-1.5 text-xs text-muted">
          {t("linkHint")}
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-note`} className={labelClass}>
          {t("noteLabel")}{" "}
          <span className="normal-case tracking-normal">({t("optional")})</span>
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          rows={3}
          maxLength={NOTE_MAX}
          placeholder={t("notePlaceholder")}
          onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))}
          className={inputClass}
        />
        <p className="mt-1.5 text-right text-xs tabular-nums text-muted">
          {note.length}/{NOTE_MAX}
        </p>
      </div>

      <div aria-hidden="true" className="sr-only">
        <label htmlFor={`${id}-website`}>Website</label>
        <input
          id={`${id}-website`}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
      >
        {busy ? t("submitting") : t("submit")}
      </button>

      {result && (
        <p
          role="status"
          className={`rounded-lg border p-4 text-sm ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
              : "border-red-500/30 bg-red-500/10 text-red-600"
          }`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
