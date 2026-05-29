/**
 * Browser-safe constants exposed at `@bernouy/cms-shared/constants`.
 * Pure data — no Bun built-ins, no Node modules — so the admin editor
 * bundle (browser target) can pull these without dragging the server
 * implementations from the main `@bernouy/cms-shared` barrel.
 */

export * from "./p9r-constants";
export * from "./editorAttributes";
