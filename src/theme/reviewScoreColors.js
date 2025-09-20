// Central color map for review score headers (1-10)
// Edit these classes to customize colors for light/dark modes.
// Each entry is a Tailwind class string (can include both light & dark variants).
// You can also use arbitrary values, e.g. 'text-[#ff8800] dark:text-[#ffaa33]'.

export const reviewScoreColorMap = {
  1: 'text-red-700 dark:text-red-400',
  2: 'text-red-600 dark:text-red-400/90',
  3: 'text-orange-600 dark:text-orange-400',
  4: 'text-amber-600 dark:text-amber-400',
  5: 'text-yellow-600 dark:text-yellow-400',
  6: 'text-lime-600 dark:text-lime-400',
  7: 'text-green-600 dark:text-green-400',
  8: 'text-emerald-600 dark:text-emerald-400',
  9: 'text-teal-600 dark:text-teal-400',
  10: 'text-cyan-600 dark:text-cyan-400'
};

// Optional helper: compute compound class (fallback if missing)
export function classForReviewScore(score) {
  return reviewScoreColorMap[score] || 'text-gray-500 dark:text-gray-400';
}

// Panel (background + border + text) styles for full review cards
// These classes are used to color the entire review container when it has text.
// Subtle hex tint palettes (light + dark) for scores 1-10.
// Light: very soft pastels; Dark: muted deep tints. Text color intentionally NOT overridden.
// Goal: maintain overall theme while giving faint contextual hue.
export const reviewScorePanelStyles = {
  1: 'bg-[#fff5f5] dark:bg-[#3a1e21] border border-[#f9e1e1] dark:border-[#4a272a]',
  2: 'bg-[#fff0f0] dark:bg-[#3a2424] border border-[#f5dcdc] dark:border-[#4a2c2c]',
  3: 'bg-[#fff8eb] dark:bg-[#392b1c] border border-[#f3e6cf] dark:border-[#473323]',
  4: 'bg-[#fefbe8] dark:bg-[#343018] border border-[#efe6bb] dark:border-[#403a20]',
  5: 'bg-[#f5fae5] dark:bg-[#28331a] border border-[#e3edc5] dark:border-[#334024]',
  6: 'bg-[#eef9e9] dark:bg-[#203525] border border-[#d8edd3] dark:border-[#2a4330]',
  7: 'bg-[#e9f9f2] dark:bg-[#193631] border border-[#d2ede3] dark:border-[#23433f]',
  8: 'bg-[#e6f8f7] dark:bg-[#16363a] border border-[#cfecec] dark:border-[#204347]',
  9: 'bg-[#e6f6fb] dark:bg-[#15323d] border border-[#d0eaf3] dark:border-[#1f4150]',
  10:'bg-[#e6f4ff] dark:bg-[#142d40] border border-[#d0e5f5] dark:border-[#1d3a4d]'
};

export function panelClassForReviewScore(score) {
  return reviewScorePanelStyles[score] || 'border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/50';
}
