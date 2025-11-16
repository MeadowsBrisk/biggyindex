// Favourite accent tokens (light/dark) centralized for easy tweaking
// Edit these hex values/classes to fine-tune the favourite “gold” look across the app.

export const favouriteAccent = {
  // Outer card/overlay ring tint
  cardRing: 'ring-1 ring-[rgba(246,196,83,0.20)] dark:ring-[rgba(212,160,23,0.15)]',

  // Soft bottom glow overlay for cards
  cardBottomGlow: 'from-[rgba(246,196,83,0.10)] dark:from-[rgba(212,160,23,0.07)]',

  // Golden wash behind thumbnails
  thumbBackground: 'bg-gradient-to-br from-[rgba(246,196,83,0.18)] via-[rgba(255,255,255,0.92)] to-[rgba(246,196,83,0.12)] dark:from-[rgba(212,160,23,0.24)] dark:via-[rgba(15,23,42,0.9)] dark:to-[rgba(212,160,23,0.16)]',

  // Thumbnail/image border + subtle outline
  thumbBorder: 'border-[#F6C453] dark:border-[#D4A017]',
  thumbShadow: 'shadow-[0_0_0_1px_rgba(246,196,83,0.40)] dark:shadow-[0_0_0_1px_rgba(212,160,23,0.35)]',

  // Inner card gradient + border upgrade
  cardInner: 'bg-gradient-to-b from-[#FFF9EC] via-white to-white dark:from-[#2A1F0F] dark:via-[#111A2A] dark:to-[#0F1725] border-[rgba(246,196,83,0.35)] dark:border-[rgba(212,160,23,0.28)] shadow-[0_8px_24px_rgba(246,196,83,0.12)] dark:shadow-[0_10px_28px_rgba(212,160,23,0.16)]',

  // Overlay panel top stripe (optional)
  overlayStripe: 'bg-[#F6C453] dark:bg-[#D4A017]',

  // Star button active fill/border
  starActiveBtn: 'bg-[#F6C453] text-black border-[#E3B94B] hover:brightness-105',
};

export function favIf(active, ...classes) {
  return active ? classes.filter(Boolean).join(' ') : '';
}
