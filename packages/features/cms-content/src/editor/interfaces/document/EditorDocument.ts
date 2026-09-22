/**
 * Stable boundary between a CMS document and an editor engine.
 *
 * `root` is the full DOM the engine may scan and mount editors into. It may
 * include global/runtime wrappers such as a binding core, shell, provider, or
 * theme element.
 *
 * `contentRoot` is the authored page content. Structure panels and save
 * serialization start there. Elements inside `root` but outside `contentRoot`
 * may still have editors and declare data scopes, but they are not listed as
 * page structure and are not saved as page content.
 */
export type EditorDocument = {
    root: HTMLElement;
    contentRoot: HTMLElement;
};
