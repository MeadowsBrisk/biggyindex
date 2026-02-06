/**
 * Centralized history state manager for modal/overlay navigation
 * Ensures consistent back button behavior across all overlays
 */

type HistoryEntry = {
  id: string;
  type: 'item' | 'seller' | 'zoom' | 'analytics' | 'reviews';
  timestamp: number;
  metadata?: any;
};

type HistoryListener = (event: PopStateEvent) => void;

class HistoryManager {
  private stack: HistoryEntry[] = [];
  private listeners: Map<string, HistoryListener> = new Map();
  private initialized = false;
  private preventNextPop = false;
  /**
   * True when close() has called history.back() but the popstate hasn't fired yet.
   * Used by URL-sync effects to avoid racing with history.back() (BUG-009).
   */
  private _pendingBack = false;
  get pendingBack() { return this._pendingBack; }

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    // Single global popstate listener
    window.addEventListener('popstate', this.handlePopState);
  }

  private handlePopState = (event: PopStateEvent) => {
    this._pendingBack = false; // BUG-009: clear pending flag on any popstate
    if (this.preventNextPop) {
      this.preventNextPop = false;
      return;
    }

    // Get the top-most entry
    const top = this.stack[this.stack.length - 1];
    if (!top) return;

    // Call the registered listener for this overlay type
    const listener = this.listeners.get(top.id);
    if (listener) {
      listener(event);
    }

    // Remove from stack
    this.stack.pop();
  };

  /**
   * Push a new overlay onto the history stack
   */
  push(type: HistoryEntry['type'], id: string, metadata?: any): void {
    // Remove any existing entry with same id to prevent duplicates
    this.stack = this.stack.filter(entry => entry.id !== id);

    const entry: HistoryEntry = {
      id,
      type,
      timestamp: Date.now(),
      metadata
    };

    this.stack.push(entry);

    // Push browser history state
    try {
      window.history.pushState(
        { __overlayId: id, __overlayType: type },
        '',
        window.location.href
      );
    } catch (e) {
      console.warn('[HistoryManager] Failed to push state:', e);
    }
  }

  /**
   * Register a close handler for an overlay
   */
  register(id: string, listener: HistoryListener): () => void {
    this.listeners.set(id, listener);

    // Return cleanup function
    return () => {
      this.listeners.delete(id);
      this.stack = this.stack.filter(entry => entry.id !== id);
    };
  }

  /**
   * Programmatically close an overlay (not via back button)
   * Balances the history state without triggering listeners
   */
  close(id: string): void {
    const index = this.stack.findIndex(entry => entry.id === id);
    if (index === -1) return;

    // Remove from stack
    this.stack.splice(index, 1);

    // If this was the top entry, we need to go back to balance history
    if (index === this.stack.length) {
      this.preventNextPop = true;
      this._pendingBack = true; // BUG-009: signal that history.back() is in-flight
      try {
        window.history.back();
      } catch (e) {
        console.warn('[HistoryManager] Failed to go back:', e);
        this.preventNextPop = false;
        this._pendingBack = false;
      }
    }
  }

  /**
   * Update the URL without affecting the history stack
   */
  replaceUrl(url: string): void {
    try {
      window.history.replaceState(
        window.history.state,
        '',
        url
      );
    } catch (e) {
      console.warn('[HistoryManager] Failed to replace URL:', e);
    }
  }

  /**
   * Check if an overlay is on the stack
   */
  isOpen(id: string): boolean {
    return this.stack.some(entry => entry.id === id);
  }

  /**
   * Get the current stack depth
   */
  getDepth(): number {
    return this.stack.length;
  }

  /**
   * Get all entries of a specific type
   */
  getByType(type: HistoryEntry['type']): HistoryEntry[] {
    return this.stack.filter(entry => entry.type === type);
  }

  /**
   * Clear all history entries (use with caution)
   */
  clear(): void {
    const depth = this.stack.length;
    this.stack = [];
    this.listeners.clear();

    // Go back to clear browser history
    if (depth > 0) {
      this.preventNextPop = true;
      try {
        window.history.go(-depth);
      } catch (e) {
        console.warn('[HistoryManager] Failed to clear history:', e);
      } finally {
        // Reset after a delay
        setTimeout(() => {
          this.preventNextPop = false;
        }, 100);
      }
    }
  }

  /**
   * Get the top-most overlay ID
   */
  getTop(): string | null {
    const top = this.stack[this.stack.length - 1];
    return top ? top.id : null;
  }
}

// Singleton instance
const historyManager = new HistoryManager();

export default historyManager;
