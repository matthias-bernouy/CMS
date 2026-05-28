/**
 * @bernouy/cms/data — bloc-editor data helpers.
 *
 * This entry hosts pure utility functions blocs may call from their
 * `BlocEditor.ts` (extension collection today; future schema/data helpers
 * land here too).
 *
 * Why a separate entry from `@bernouy/cms/editor` — the `editor` entry
 * is intercepted by `p9rExternalsPlugin` so its symbols (`Editor`,
 * `registerEditor`) read from `window.p9r.*` (singleton across blocs).
 * That mechanism only matters for class identity / `instanceof` checks.
 * Plain utility functions should be bundled inline per bloc — cheaper
 * than the global plumbing, and keeps the editor entry's shimmable
 * surface small. This entry is NOT intercepted; bun bundles each call
 * site normally.
 */
export { getFields } from "./src/core/data/getFields";
export { collectAncestorExtensions } from "./src/core/editorSystem/extensions/collectAncestors";
export type { Surface, SurfaceExtensionMap, DataExtension, RichTextBarExtension, BlocActionExtension, Field, PickContext, BlocActionContext } from "./src/core/editorSystem/extensions/types";
