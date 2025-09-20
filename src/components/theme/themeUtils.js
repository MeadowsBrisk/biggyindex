// Centralized theme utility classes using Tailwind v4's dark mode support
// Mirror of your previous project structure for consistent styling

export const backgrounds = {
  site: "bg-white dark:bg-gray-950",
  page: "bg-white dark:bg-gray-950",
  element: "bg-white dark:bg-gray-900",
  accordion: "bg-white dark:bg-gray-900",
  tile: "bg-gray-50 dark:bg-gray-800",
  section: "bg-gray-50 dark:bg-gray-800",
  header: "bg-white dark:bg-gray-900",
  input: "bg-white dark:bg-gray-900",
  toggle: "bg-gray-100 dark:bg-gray-800",
  toggleHighlight: "bg-white dark:bg-gray-700",
  progressBar: "bg-gray-200 dark:bg-gray-800",
  progressBarFill: "bg-blue-500 dark:bg-blue-400",
};

export const text = {
  primary: "text-gray-800 dark:text-gray-100",
  secondary: "text-gray-600 dark:text-gray-300",
  muted: "text-gray-500 dark:text-gray-400",
  strong: "text-gray-700 dark:text-gray-300",
  header: "text-gray-800 dark:text-gray-100",
  tile: "text-gray-900 dark:text-gray-100",
  tileSubtle: "text-gray-500 dark:text-gray-400",
  formLabel: "text-gray-700 dark:text-gray-300",
  input: "text-gray-900 dark:text-gray-100",
  disabled: "text-gray-500 dark:text-gray-400",
  disabledStrong: "text-gray-400 dark:text-gray-500",
  red: "text-red-600 dark:text-red-400",
  green: "text-green-600 dark:text-green-400",
  blue: "text-blue-700 dark:text-blue-300",
  purple: "text-purple-700 dark:text-purple-300",
  teal: "text-teal-600 dark:text-teal-400",
};

export const borders = {
  default: "border-gray-200 dark:border-gray-700",
  sidebar: "border-gray-200 dark:border-gray-700",
  header: "border-gray-200 dark:border-gray-800",
  content: "border-gray-200 dark:border-gray-800",
  tile: "border-gray-200 dark:border-gray-700",
  tileDark: "border-gray-200 dark:border-red-100",
  input: "border-gray-300 dark:border-gray-700",
  toggle: "border-gray-200 dark:border-gray-700",
};

export const buttons = {
  primary: "bg-blue-500 hover:bg-blue-600 text-white dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-white dark:border dark:border-blue-600",
  secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white",
  danger: "text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/30",
  toggleActive: "bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-800",
  toggleInactive: "bg-white border-gray-300 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700",
};

export const theme = {
  bg: backgrounds,
  text,
  border: borders,
  button: buttons,
};

export function getThemeClass(path) {
  const keys = path.split('.');
  let result = theme;
  for (const key of keys) {
    result = result?.[key];
    if (!result) return '';
  }
  return result;
}


