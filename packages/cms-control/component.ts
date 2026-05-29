/**
 * @bernouy/cms-control — view-side authoring entry point.
 *
 * `Bloc.ts` files should import `Component` from `@bernouy/cms-blocs/base`.
 * This legacy entry remains as a temporary compatibility alias.
 * This entry deliberately re-exports *only* the base class needed to author
 * the view side of a bloc. Nothing editor-related (Editor, registerEditor,
 * ObserverManager, …) is reachable from this entry — even transitively — so
 * the bundle that visitors download never contains editor code.
 */
export { Component, type ComponentMetadata } from "@bernouy/cms-blocs/base";
