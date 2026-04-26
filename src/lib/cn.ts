import { type ClassValue, clsx } from "clsx";

/** cx() — clsx only, no tailwind-merge overhead. Use in application components. */
export function cx(...inputs: ClassValue[]) {
  return clsx(inputs);
}
