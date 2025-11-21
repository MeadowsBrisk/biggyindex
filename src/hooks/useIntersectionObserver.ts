import { useEffect, useRef, useState } from 'react';

// Global observer instance map (by threshold/margin key)
const observers = new Map<string, IntersectionObserver>();
const subscribers = new Map<string, Set<(entry: IntersectionObserverEntry) => void>>();

const getObserver = (options: IntersectionObserverInit) => {
  const key = JSON.stringify(options);
  
  if (!observers.has(key)) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const callbacks = subscribers.get(key);
        // We can't easily map entry.target back to a specific callback without a Map
        // So we'll dispatch to all subscribers and let them check if it's their target
        // Ideally, we'd map target -> callback, but for this simple use case (one-off trigger),
        // we can use a custom property on the element or a WeakMap.
        
        // Better approach: The observer callback receives entries. 
        // We need to notify the specific hook instance associated with entry.target.
        notifyTarget(entry);
      });
    }, options);
    observers.set(key, observer);
  }
  
  return observers.get(key)!;
};

// Map element -> callback
const elementCallbacks = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>();

const notifyTarget = (entry: IntersectionObserverEntry) => {
  const cb = elementCallbacks.get(entry.target);
  if (cb) cb(entry);
};

export function useIntersectionObserver(
  ref: React.RefObject<Element | null>,
  options: IntersectionObserverInit = { threshold: 0, rootMargin: '0px' },
  freezeOnceVisible = false
) {
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const frozen = entry?.isIntersecting && freezeOnceVisible;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref?.current;
    if (!node || frozen) return;

    // Immediate check (optional optimization)
    if (freezeOnceVisible && !isVisible) {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        setIsVisible(true);
        // If we just want the boolean, we can stop here if we don't strictly need the Entry object
        // But to be correct with the hook signature, we should let the observer fire.
      }
    }

    const observer = getObserver(options);
    
    const callback = (e: IntersectionObserverEntry) => {
      setEntry(e);
      setIsVisible(e.isIntersecting);
      if (e.isIntersecting && freezeOnceVisible) {
        observer.unobserve(node);
        elementCallbacks.delete(node);
      }
    };

    elementCallbacks.set(node, callback);
    observer.observe(node);

    return () => {
      observer.unobserve(node);
      elementCallbacks.delete(node);
    };
  }, [ref?.current, JSON.stringify(options), frozen]);

  return { entry, isVisible };
}
