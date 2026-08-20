import type { ReactNode } from "react";

/**
 * Type shim for React's <ViewTransition> component.
 *
 * The App Router runs on Next's vendored React canary, which exports
 * `ViewTransition` at runtime (verified: `exports.ViewTransition` in
 * next/dist/compiled/react). The stable `@types/react` package doesn't
 * declare it yet, so this augmentation fills the gap with just the props
 * this codebase uses. Remove once @types/react ships the declaration.
 */
declare module "react" {
  /** Maps a view-transition class per transition type, with a default. */
  type ViewTransitionClass = string | { [transitionType: string]: string };

  interface ViewTransitionProps {
    children?: ReactNode;
    /** Names the element so old/new pairs can morph across updates. */
    name?: string;
    /** Class applied when the content enters during a transition. */
    enter?: ViewTransitionClass;
    /** Class applied when the content exits during a transition. */
    exit?: ViewTransitionClass;
    /** Class applied when a named pair morphs (shared-element). */
    share?: ViewTransitionClass;
    /** Class for updates not covered above; "none" opts out. */
    default?: ViewTransitionClass;
  }

  export function ViewTransition(props: ViewTransitionProps): ReactNode;
}
