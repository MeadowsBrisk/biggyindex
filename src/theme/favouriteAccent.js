// Favourite accent tokens (light/dark) centralized for easy tweaking
// Edit these hex values/classes to fine-tune the favourite “gold” look across the app.

export const favouriteAccent = {
  // Outer card/overlay ring tint
  cardRing: 'ring-1 ring-[rgba(246,196,83,0.20)] dark:ring-[rgba(212,160,23,0.15)]',

  // Soft bottom glow overlay for cards
  cardBottomGlow: 'from-[rgba(246,196,83,0.10)] dark:from-[rgba(212,160,23,0.07)]',

  // Thumbnail/image border + subtle outline
  thumbBorder: 'border-[#F6C453] dark:border-[#D4A017]',
  thumbShadow: 'shadow-[0_0_0_1px_rgba(246,196,83,0.40)] dark:shadow-[0_0_0_1px_rgba(212,160,23,0.35)]',

  // Overlay panel top stripe (optional)
  overlayStripe: 'bg-[#F6C453] dark:bg-[#D4A017]',

  // Star button active fill/border
  starActiveBtn: 'bg-[#F6C453] text-black border-[#E3B94B] hover:brightness-105',
};

export function favIf(active, ...classes) {
  return active ? classes.filter(Boolean).join(' ') : '';
}
