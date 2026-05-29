/**
 * Recursively strip every editor-only artifact from `root` and its
 * descendants. Called by `EditorRoot.pageContent` as a final safety pass
 * before serializing — see the comment at that call site for why we run
 * it on top of the per-Editor `viewClient()` strip.
 *
 * Removed:
 *  - any attribute starting with `p9r-` (identifier, parent-identifier,
 *    is-editor, action-disable-*, text-placeholder, is-creating, …)
 *  - `contenteditable`, `tabindex`, `draggable`
 *  - the `editor-block` class
 *  - inline `pointer-events:` styles (kept by the editor to override the
 *    host bloc's CSS during edit)
 *
 * Walks into `<template>.content` so chrome that the observer might brush
 * onto template children (a stamp source the bloc holds in DOM-detached
 * form) doesn't escape the strip.
 */
export function stripResidualChrome(root: Element): void {
    walk(root);
}

function walk(el: Element): void {
    for (const a of Array.from(el.attributes)) {
        if (a.name.startsWith('p9r-')) el.removeAttribute(a.name);
    }
    el.removeAttribute('contenteditable');
    el.removeAttribute('tabindex');
    el.removeAttribute('draggable');
    if (el.classList.contains('editor-block')) {
        el.classList.remove('editor-block');
        if (!el.getAttribute('class')) el.removeAttribute('class');
    }
    const style = el.getAttribute('style');
    if (style && /pointer-events\s*:/.test(style)) el.removeAttribute('style');

    for (const c of Array.from(el.children)) walk(c);
    if (el.tagName === 'TEMPLATE') {
        for (const c of Array.from((el as HTMLTemplateElement).content.children)) walk(c);
    }
}
