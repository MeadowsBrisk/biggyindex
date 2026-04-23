"use client";

import { atom, useAtom, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { Check, AlertTriangle, Info, X, XCircle } from "lucide-react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** ms. 0 = sticky */
  duration: number;
}

interface ToastInput {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

export const toastsAtom = atom<Toast[]>([]);

function genId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Use inside event handlers: `const addToast = useAddToast(); addToast({...})`. */
export function useAddToast() {
  const setToasts = useSetAtom(toastsAtom);
  return (input: string | ToastInput) => {
    const t: Toast = {
      id: genId(),
      message: typeof input === "string" ? input : input.message,
      variant: typeof input === "string" ? "info" : (input.variant ?? "info"),
      duration:
        typeof input === "string" ? 3500 : (input.duration ?? 3500),
    };
    setToasts((prev) => [...prev, t]);
    return t.id;
  };
}

export function useDismissToast() {
  const setToasts = useSetAtom(toastsAtom);
  return (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));
}

function variantClasses(v: ToastVariant) {
  switch (v) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "error":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
}

function VariantIcon({ v }: { v: ToastVariant }) {
  const size = 16;
  if (v === "success") return <Check size={size} />;
  if (v === "error") return <XCircle size={size} />;
  if (v === "warning") return <AlertTriangle size={size} />;
  return <Info size={size} />;
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (toast.duration <= 0) return;
    timerRef.current = window.setTimeout(
      () => onDismiss(toast.id),
      toast.duration,
    );
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur-sm pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 ${variantClasses(toast.variant)}`}
    >
      <VariantIcon v={toast.variant} />
      <span className="flex-1 font-medium">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded p-0.5 opacity-60 hover:opacity-100 transition cursor-pointer"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useAtom(toastsAtom);
  const dismiss = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100%-2rem))] flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
