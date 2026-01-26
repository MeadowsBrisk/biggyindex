/**
 * Shared IntersectionObserver manager for performance optimization.
 * Instead of each ItemCard creating its own observer (2000+ observers),
 * this shares a single observer across all elements.
 */

type ObserverCallback = () => void;

interface ObserverManager {
  observer: IntersectionObserver | null;
  callbacks: Map<Element, ObserverCallback>;
  observe: (el: Element, callback: ObserverCallback) => void;
  unobserve: (el: Element) => void;
}

// Singleton instance - shared across all components
let manager: ObserverManager | null = null;

function getManager(): ObserverManager {
  if (manager) return manager;
  
  const callbacks = new Map<Element, ObserverCallback>();
  
  const observer = typeof window !== 'undefined' && 'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const callback = callbacks.get(entry.target);
              if (callback) {
                callback();
                // Auto-unobserve after triggering (one-time enter detection)
                observer?.unobserve(entry.target);
                callbacks.delete(entry.target);
              }
            }
          }
        },
        { threshold: 0, rootMargin: '0px 0px -10% 0px' }
      )
    : null;
  
  manager = {
    observer,
    callbacks,
    observe(el: Element, callback: ObserverCallback) {
      if (!observer) {
        // SSR or no IntersectionObserver support - call immediately
        callback();
        return;
      }
      callbacks.set(el, callback);
      observer.observe(el);
    },
    unobserve(el: Element) {
      if (!observer) return;
      observer.unobserve(el);
      callbacks.delete(el);
    },
  };
  
  return manager;
}

/**
 * Observe an element and call the callback when it enters the viewport.
 * Uses a shared IntersectionObserver for performance.
 * @param el - The element to observe
 * @param callback - Called once when the element enters the viewport
 */
export function observeElement(el: Element, callback: ObserverCallback): void {
  getManager().observe(el, callback);
}

/**
 * Stop observing an element.
 * @param el - The element to unobserve
 */
export function unobserveElement(el: Element): void {
  getManager().unobserve(el);
}

/**
 * Check if IntersectionObserver is supported.
 */
export function isObserverSupported(): boolean {
  return typeof window !== 'undefined' && 'IntersectionObserver' in window;
}
