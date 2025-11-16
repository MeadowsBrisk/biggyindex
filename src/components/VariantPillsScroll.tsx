import React from 'react';
import { decodeEntities } from '@/lib/format';

interface Variant {
  id?: string | number;
  description: string;
  baseAmount?: number | null;
}

interface VariantPillsScrollProps {
  variants: Variant[];
  className?: string;
}

export default function VariantPillsScroll({ variants, className = '' }: VariantPillsScrollProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = React.useState(false);
  const [isAtStart, setIsAtStart] = React.useState(true);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    const checkScrollable = () => {
      setIsScrollable(el.scrollWidth > el.clientWidth);
    };
    
    // Check after layout settles (only on mount/variants change, not on resize)
    const timer = setTimeout(() => {
      requestAnimationFrame(checkScrollable);
    }, 150);
    
    return () => clearTimeout(timer);
  }, [variants]);

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setIsAtStart(el.scrollLeft < 10);
  }, []);

  return (
    <div className={`mt-4 pointer-events-auto relative ${className}`}>
      <div 
        ref={scrollRef}
        className="variant-pills-scroll"
        onScroll={handleScroll}
        onMouseDown={(e) => {
          if (!isScrollable) return;
          
          const el = e.currentTarget;
          const startX = e.pageX - el.offsetLeft;
          const scrollLeft = el.scrollLeft;
          let isDragging = false;
          
          const onMouseMove = (e: MouseEvent) => {
            isDragging = true;
            const x = e.pageX - el.offsetLeft;
            const walk = (x - startX) * 1.5;
            el.scrollLeft = scrollLeft - walk;
          };
          
          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            setTimeout(() => { isDragging = false; }, 10);
          };
          
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
        style={{ cursor: isScrollable ? 'grab' : 'default' }}
      >
        {variants.map((v, idx) => (
          <span key={(v.id as any) || idx} className="variant-pill">
            {decodeEntities(v.description)}
          </span>
        ))}
        {isScrollable && <div className="shrink-0 w-1" aria-hidden="true" />}
      </div>
      {isScrollable && isAtStart && (
        <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pointer-events-none pr-2 bg-gradient-to-l from-white via-white/95 via-40% to-transparent dark:from-[#0f1725] dark:via-[#0f1725]/95 dark:via-40% dark:to-transparent group-hover:from-gray-50 group-hover:via-gray-50/95 dark:group-hover:from-[#141d30] dark:group-hover:via-[#141d30]/95 pl-16 transition-colors opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            <span>{variants.length}</span>
            <span>→</span>
          </span>
        </div>
      )}
    </div>
  );
}
