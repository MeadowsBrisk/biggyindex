import { useEffect, useRef, useCallback } from 'react';
import historyManager from '@/lib/historyManager';

type OverlayType = 'zoom' | 'filter' | 'pricing' | 'modal';

interface UseHistoryStateOptions {
  /** Unique ID for this overlay instance */
  id: string;
  /** Type of overlay */
  type: OverlayType;
  /** Whether the overlay is currently open */
  isOpen: boolean;
  /** Callback when back button is pressed */
  onClose: () => void;
  /**
   * How programmatic close should balance history:
   * - 'back' (default): call history.back() via manager.close()
   * - 'silent': remove from internal stack without browser back
   */
  closeStrategy?: 'back' | 'silent';
}

/**
 * Hook to manage history state for a modal/overlay.
 * When the overlay opens, a history entry is pushed so pressing
 * Back closes the overlay instead of navigating away.
 */
export function useHistoryState({
  id,
  type,
  isOpen,
  onClose,
  closeStrategy = 'back',
}: UseHistoryStateOptions) {
  const closeRef = useRef(onClose);
  const didPushRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const generation = ++generationRef.current;
    historyManager.push(type, id);
    didPushRef.current = true;

    const unregister = historyManager.register(id, () => {
      didPushRef.current = false;
      closeRef.current?.();
    });

    return () => {
      unregister();

      queueMicrotask(() => {
        if (generationRef.current !== generation) return;
        if (!didPushRef.current) return;

        if (closeStrategy === 'silent') {
          historyManager.remove(id);
        } else {
          historyManager.close(id);
        }
        didPushRef.current = false;
      });
    };
  }, [isOpen, id, type, closeStrategy]);

  /** Programmatically close the overlay (handles history balancing) */
  const closeOverlay = useCallback(() => {
    if (didPushRef.current) {
      if (closeStrategy === 'silent') {
        historyManager.remove(id);
      } else {
        historyManager.close(id);
      }
      didPushRef.current = false;
    }
    closeRef.current?.();
  }, [id, closeStrategy]);

  return { closeOverlay };
}
