import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Parse and format item update reasons from the indexer's lur field.
 * Handles compact format: "+7 / -7 variants" or single-sided "+7 variants" / "-7 variants".
 */
export function useUpdateReason(lastUpdateReason: string | null | undefined): string {
  const tItem = useTranslations('Item');

  return useMemo(() => {
    if (!lastUpdateReason || typeof lastUpdateReason !== 'string') return '';
    const s = lastUpdateReason;
    
    // Check for new compact format from unified indexer: "+7 / -7 variants" or "+7 variants" or "-7 variants"
    const compactMatch = s.match(/([+-]\d+)\s*\/\s*([+-]\d+)\s+variants?/i);
    if (compactMatch) {
      // Format: "+7 / -7 variants" - parse both sides
      const adds = compactMatch[1].startsWith('+') ? parseInt(compactMatch[1].substring(1)) : 0;
      const removes = compactMatch[2].startsWith('-') ? parseInt(compactMatch[2].substring(1)) : 0;
      const tokens: string[] = [];
      if (s.includes('Price changed')) tokens.push(tItem('update.priceChanged'));
      if (s.includes('Description changed')) tokens.push(tItem('update.descriptionChanged'));
      if (s.includes('Images changed')) tokens.push(tItem('update.imagesChanged'));
      if (adds > 0) tokens.push(`+${adds} ${tItem('update.variantsNoun', { count: adds })}`);
      if (removes > 0) tokens.push(`-${removes} ${tItem('update.variantsNoun', { count: removes })}`);
      return tokens.join(', ');
    }
    
    // Check for single-sided compact format: "+7 variants" or "-7 variants"
    const singleCompact = s.match(/([+-]\d+)\s+variants?/i);
    if (singleCompact) {
      const num = parseInt(singleCompact[1]);
      const tokens: string[] = [];
      if (s.includes('Price changed')) tokens.push(tItem('update.priceChanged'));
      if (s.includes('Description changed')) tokens.push(tItem('update.descriptionChanged'));
      if (s.includes('Images changed')) tokens.push(tItem('update.imagesChanged'));
      if (num > 0) tokens.push(`+${num} ${tItem('update.variantsNoun', { count: num })}`);
      else if (num < 0) tokens.push(`${num} ${tItem('update.variantsNoun', { count: Math.abs(num) })}`);
      return tokens.join(', ');
    }
    
    // No match - return empty string
    return '';
  }, [lastUpdateReason, tItem]);
}
