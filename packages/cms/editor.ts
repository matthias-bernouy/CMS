/**
 * @bernouy/cms — editor-side authoring entry point.
 *
 * `BlocEditor.ts` files import from `@bernouy/cms/editor`. This entry
 * exposes the `Editor` base class and the `registerEditor` / `registerEditor_opaque`
 * helpers. It is the *only* place from which editor-side code should be
 * imported when authoring a bloc — `@bernouy/cms/component` is kept
 * deliberately free of editor imports so the view bundle stays lean.
 */
export { Editor } from "src/control/core/editorSystem/Editor/Editor";
export { registerEditor, registerEditor_opaque } from "src/control/core/editorSystem/registerEditor";
