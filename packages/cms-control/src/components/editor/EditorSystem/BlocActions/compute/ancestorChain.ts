import type { Editor } from '@bernouy/cms/editor';

export function findEditorByElement(target: HTMLElement): Editor | null {
    const id = target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
    if (!id) return null;
    return (document.compIdentifierToEditor?.get(id) as Editor | undefined) ?? null;
}

export function findParentEditor(target: HTMLElement): Editor | null {
    const parentId = target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (!parentId) return null;
    return (document.compIdentifierToEditor?.get(parentId) as Editor | undefined) ?? null;
}

/**
 * Walk the parent-identifier chain from `editor` up to the root, returning
 * `[root, …, editor]`. Caps the walk at 20 hops as a safety net against
 * pathological cycles in the identifier graph.
 */
export function ancestorChain(editor: Editor): Editor[] {
    const chain: Editor[] = [editor];
    let el: HTMLElement = editor.target;
    for (let i = 0; i < 20; i++) {
        const pid = el.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (!pid) break;
        const pEd = document.compIdentifierToEditor?.get(pid) as Editor | undefined;
        if (!pEd) break;
        chain.unshift(pEd);
        el = pEd.target;
    }
    return chain;
}

/**
 * Reduce a chain to at most 5 items by collapsing the middle to an ellipsis
 * placeholder (null). Keeps the root, the last three items, and a null marker
 * between them. Returns the original list unchanged if it already fits.
 */
export function collapseChain<T>(items: T[]): (T | null)[] {
    if (items.length <= 5) return items;
    return [items[0]!, null, items[items.length - 3]!, items[items.length - 2]!, items[items.length - 1]!];
}
