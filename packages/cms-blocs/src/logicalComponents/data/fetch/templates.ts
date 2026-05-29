export type TemplateSlot = 'default' | 'loading' | 'error' | 'empty';

export type TemplateMap = Partial<Record<TemplateSlot, HTMLTemplateElement>>;

/**
 * Collect direct `<template>` children of `host`, indexed by their `slot`
 * attribute. A template without `slot` is the `default` (data) template.
 * Only the first template per slot is kept.
 */
export function collectTemplates(host: Element): TemplateMap {
    const map: TemplateMap = {};
    for (const child of Array.from(host.children)) {
        if (child.tagName !== 'TEMPLATE') continue;
        const slot = (child.getAttribute('slot') || 'default') as TemplateSlot;
        if (!map[slot]) map[slot] = child as HTMLTemplateElement;
    }
    return map;
}
