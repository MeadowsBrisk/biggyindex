/**
 * Shared IntersectionObserver singleton.
 *
 * Instead of creating one IntersectionObserver per element (500+ for a
 * full item grid), a single observer watches all registered elements.
 * When an element intersects, its callback fires and it's auto-unobserved.
 */

type EntryCallback = (entry: IntersectionObserverEntry) => void;

const callbacks = new Map<Element, EntryCallback>();

let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cb = callbacks.get(entry.target);
            if (cb) {
              cb(entry);
              observer!.unobserve(entry.target);
              callbacks.delete(entry.target);
            }
          }
        }
      },
      { threshold: 0.05, rootMargin: "60px" },
    );
  }
  return observer;
}

/** Start observing an element. Callback fires once on intersection, then auto-unobserves. */
export function observe(el: Element, callback: EntryCallback) {
  callbacks.set(el, callback);
  getObserver().observe(el);
}

/** Stop observing an element (cleanup). */
export function unobserve(el: Element) {
  callbacks.delete(el);
  observer?.unobserve(el);
}
