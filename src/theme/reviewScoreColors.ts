// Central helper functions for review score styling (1-10)
// Styles are defined in src/styles/elements/reviews.css
// These functions return CSS class names for use in components.

/**
 * Get text color class for a review score header.
 * @param score - Review score from 1-10
 * @returns CSS class name (e.g., 'review-score-7')
 */
export function classForReviewScore(score: number): string {
  if (score >= 1 && score <= 10) {
    return `review-score-${score}`;
  }
  return 'review-score-default';
}

/**
 * Get panel class (background + border) for a full review card.
 * @param score - Review score from 1-10
 * @returns CSS class name (e.g., 'review-panel-7')
 */
export function panelClassForReviewScore(score: number): string {
  if (score >= 1 && score <= 10) {
    return `review-panel-${score}`;
  }
  return 'review-panel-default';
}
