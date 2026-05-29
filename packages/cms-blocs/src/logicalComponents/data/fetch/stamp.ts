import { processTemplate } from './render';

/**
 * Tear down `previous` nodes, stamp `tpl` against `context`, and insert
 * the new fragment as siblings of `host` (just before it). Returns the
 * list of inserted nodes so the next call can clean them up.
 */
export function stampSiblingsOf(
    host: Element,
    tpl: HTMLTemplateElement,
    context: unknown,
    previous: Node[],
): Node[] {
    clearStamped(previous);
    const parent = host.parentNode;
    if (!parent) return [];
    const fragment = processTemplate(tpl, context);
    const newNodes = Array.from(fragment.childNodes);
    parent.insertBefore(fragment, host);
    return newNodes;
}

export function clearStamped(nodes: Node[]): void {
    for (const n of nodes) n.parentNode?.removeChild(n);
}
