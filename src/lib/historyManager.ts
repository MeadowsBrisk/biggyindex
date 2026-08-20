/**
 * Centralized history state for modal/overlay navigation: pressing Back
 * closes the topmost overlay instead of navigating away.
 */

type OverlayType = "zoom" | "filter" | "pricing" | "modal";

interface HistoryEntry {
  id: string;
  type: OverlayType;
  timestamp: number;
}

type HistoryListener = (event: PopStateEvent) => void;

class HistoryManager {
  private stack: HistoryEntry[] = [];
  private listeners = new Map<string, HistoryListener>();
  private initialized = false;
  private preventNextPop = false;
  private skippedBrowserEntries = 0;
  private _pendingBack = false;
  get pendingBack() {
    return this._pendingBack;
  }

  constructor() {
    if (typeof window !== "undefined") this.init();
  }

  private init() {
    if (this.initialized) return;
    this.initialized = true;
    // Capture phase so we fire before Next.js App Router's popstate handler
    window.addEventListener("popstate", this.handlePopState, true);
  }

  private handlePopState = (event: PopStateEvent) => {
    this._pendingBack = false;
    if (this.preventNextPop) {
      this.preventNextPop = false;
      // Prevent Next.js from also reacting to our balancing back()
      event.stopImmediatePropagation();
      return;
    }

    const top = this.stack[this.stack.length - 1];
    if (!top) return; // empty stack — let Next.js handle normally

    // Overlay is open: handle close and prevent Next.js route navigation
    event.stopImmediatePropagation();

    const listener = this.listeners.get(top.id);
    if (listener) listener(event);

    this.stack.pop();
  };

  /** Push a new overlay onto the history stack */
  push(type: OverlayType, id: string): void {
    // A duplicate id (e.g. a Strict Mode re-mount) must not pushState twice,
    // or the browser history desyncs from the stack.
    if (this.stack.some((e) => e.id === id)) return;

    this.stack.push({ id, type, timestamp: Date.now() });

    try {
      // Use native pushState to bypass Next.js App Router interception
      const nativePush = History.prototype.pushState;
      const baseState =
        window.history.state && typeof window.history.state === "object"
          ? (window.history.state as Record<string, unknown>)
          : {};
      nativePush.call(
        window.history,
        { ...baseState, __overlayId: id, __overlayType: type },
        "",
        window.location.href,
      );
    } catch (e) {
      console.warn("[HistoryManager] pushState failed:", e);
    }
  }

  /** Register a close handler; returns cleanup function */
  register(id: string, listener: HistoryListener): () => void {
    this.listeners.set(id, listener);
    return () => {
      this.listeners.delete(id);
    };
  }

  /** Programmatically close an overlay, balancing browser history */
  close(id: string): void {
    const index = this.stack.findIndex((e) => e.id === id);
    if (index === -1) return;

    this.stack.splice(index, 1);

    // If it was the topmost entry, go back to balance the pushState
    if (index === this.stack.length) {
      this.preventNextPop = true;
      this._pendingBack = true;
      const steps = 1 + this.skippedBrowserEntries;
      this.skippedBrowserEntries = 0;
      try {
        if (steps > 1) {
          window.history.go(-steps);
        } else {
          window.history.back();
        }
      } catch (e) {
        console.warn("[HistoryManager] history.back() failed:", e);
        this.preventNextPop = false;
        this._pendingBack = false;
      }
    }
  }

  /**
   * Remove an overlay from the stack without calling history.back() — for
   * nested overlays that must close without triggering route navigation.
   */
  remove(id: string): void {
    const index = this.stack.findIndex((e) => e.id === id);
    if (index === -1) return;
    const wasTop = index === this.stack.length - 1;
    this.stack.splice(index, 1);
    // A silent remove leaves one pushed browser entry behind.
    // The next balancing close() should skip over it.
    if (wasTop) {
      this.skippedBrowserEntries += 1;
    }
  }

  /** Check whether an overlay is in the stack */
  isOpen(id: string): boolean {
    return this.stack.some((e) => e.id === id);
  }

  /** Get the topmost overlay ID */
  getTop(): string | null {
    const top = this.stack[this.stack.length - 1];
    return top ? top.id : null;
  }
}

/** Singleton instance */
const historyManager = new HistoryManager();
export default historyManager;
