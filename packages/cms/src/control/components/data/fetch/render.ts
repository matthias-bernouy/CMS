import { resolve } from './pathHelpers';
import { interpolateNode } from './interpolate';

/**
 * Process a `<template>` against a data context.
 *  - No `for` attribute: stamp once (single render).
 *  - `for="."`: iterate over the current context (which must be an array).
 *  - `for="path"`: iterate over the array at `path`.
 * Nested `<template>` elements inside the rendered content go through
 * `renderFragment`, which calls back into this function recursively.
 */
export function processTemplate(tpl: HTMLTemplateElement, context: unknown): DocumentFragment {
    const forKey = tpl.getAttribute('for');
    const out = document.createDocumentFragment();

    if (forKey === null) {
        const clone = tpl.content.cloneNode(true) as DocumentFragment;
        renderFragment(clone, context);
        out.appendChild(clone);
        return out;
    }

    const items = forKey === '.' ? context : resolve(context, forKey);
    if (!Array.isArray(items)) {
        console.warn(`cms-fetch: <template for="${forKey}"> expected an array, got`, items);
        return out;
    }

    for (const item of items) {
        const clone = tpl.content.cloneNode(true) as DocumentFragment;
        renderFragment(clone, item);
        out.appendChild(clone);
    }
    return out;
}

/**
 * Renders a fragment in place against a data context. Replaces nested
 * `<template>` elements with their `processTemplate` output, then
 * interpolates `{{path}}` in the remaining text and attribute values.
 */
export function renderFragment(root: Node, context: unknown): void {
    // Collect templates BEFORE mutating — replacement would invalidate any
    // live querySelectorAll.
    const templates: HTMLTemplateElement[] = [];
    collectDirectTemplates(root, templates);
    for (const tpl of templates) {
        tpl.parentNode?.replaceChild(processTemplate(tpl, context), tpl);
    }
    interpolateNode(root, context);
}

/**
 * Collect `<template>` descendants of `root`, but stop descending when
 * we hit a `<template>` — nested ones are processed by their parent's
 * recursive renderFragment call.
 */
function collectDirectTemplates(root: Node, out: HTMLTemplateElement[]): void {
    for (const child of Array.from(root.childNodes)) {
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const el = child as Element;
        if (el.tagName === 'TEMPLATE') out.push(el as HTMLTemplateElement);
        else collectDirectTemplates(el, out);
    }
}
