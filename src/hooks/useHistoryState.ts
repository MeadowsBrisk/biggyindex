import { useEffect, useRef, useCallback } from 'react';
import historyManager from '@/lib/ui/historyManager';

type OverlayType = 'item' | 'seller' | 'zoom' | 'analytics' | 'reviews';

interface UseHistoryStateOptions {
  /** Unique ID for this overlay instance */
  id: string;
  /** Type of overlay */
  type: OverlayType;
  /** Whether the overlay is currently open */
  isOpen: boolean;
  /** Callback when back button is pressed */
  onClose: () => void;
  /** Optional: Whether this overlay depends on another being open */
  parentId?: string;
  /** Optional: Additional metadata */
  metadata?: any;
}

/**
 * Hook to manage history state for a modal/overlay
 * 
 * Usage:
 * ```tsx
 * const { closeOverlay } = useHistoryState({
 *   id: `item-${refNum}`,
 *   type: 'item',
 *   isOpen: !!refNum,
 *   onClose: () => setRefNum(null)
 * });
 * ```
 */
export function useHistoryState({
  id,
  type,
  isOpen,
  onClose,
  parentId,
  metadata
}: UseHistoryStateOptions) {
  const closeRef = useRef(onClose);
  const didPushRef = useRef(false);
  const isOpenRef = useRef(isOpen);

  // Keep refs in sync
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Handle open/close lifecycle
  useEffect(() => {
    if (!isOpen) {
      // When closed, cleanup is handled by the previous effect's return function.
      // No action needed here — avoids double-close race (BUG-009).
      return;
    }

    // Register this overlay with the history manager
    historyManager.push(type, id, metadata);
    didPushRef.current = true;

    // Register the close handler
    const unregister = historyManager.register(id, (event) => {
      // Prevent default navigation
      if (event) {
        try {
          event.preventDefault?.();
          event.stopImmediatePropagation?.();
        } catch {}
      }

      // Call the close callback
      if (closeRef.current) {
        closeRef.current();
      }
    });

    // Cleanup when effect re-runs (isOpen false) or component unmounts.
    // close() MUST run before unregister() so the stack entry still exists
    // when close() looks for it to call history.back().
    return () => {
      if (didPushRef.current) {
        historyManager.close(id);
        didPushRef.current = false;
      }
      unregister();
    };
  }, [isOpen, id, type, metadata]);

  /**
   * Programmatically close the overlay
   * This handles the history state correctly
   */
  const closeOverlay = useCallback(() => {
    if (didPushRef.current) {
      historyManager.close(id);
      didPushRef.current = false;
    }
    onClose();
  }, [id, onClose]);

  /**
   * Update the browser URL without affecting history
   */
  const replaceUrl = useCallback((url: string) => {
    historyManager.replaceUrl(url);
  }, []);

  return {
    closeOverlay,
    replaceUrl,
    isTopmost: historyManager.getTop() === id
  };
}
