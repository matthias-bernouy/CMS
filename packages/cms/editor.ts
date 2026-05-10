/**
 * @bernouy/cms — editor-side authoring entry point.
 *
 * `BlocEditor.ts` files import from `@bernouy/cms/editor`. This entry
 * exposes the `Editor` base class and the `registerEditor` /
 * `registerEditor_opaque` helpers. Imports from here are intercepted by
 * `p9rExternalsPlugin` and rewritten to read from `window.p9r.*`, so
 * every bloc shares one canonical class instance (required for
 * `instanceof` checks on parent/child editor relationships).
 *
 * Pure utility functions that don't need shared identity (e.g.
 * `getFields`) live in `@bernouy/cms/data` so bun bundles them inline
 * per bloc — cheaper than going through the global mechanism.
 */
export { Editor } from "src/control/core/editorSystem/Editor/Editor";
export { registerEditor, registerEditor_opaque } from "src/control/core/editorSystem/registerEditor";
