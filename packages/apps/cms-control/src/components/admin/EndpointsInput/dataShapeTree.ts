import { makeNode, type NodeHandle } from "./bodyNode";
import type { DataShape } from "@bernouy/cms-gateway";

/**
 * A reusable, FIELDLESS DataShape-tree widget. Owns the empty/tree toggle UI for
 * one optional recursive DataShape (see `bodyNode.ts`) but NOT the hidden field —
 * the caller wires `read()`/`onChange` to its own serialisation. Reused for the In
 * body and (later) each Out response. The returned `element` carries NO data-role;
 * the caller sets one.
 *
 * `onChange` fires on define (empty→tree), remove (tree→empty) and every internal
 * node edit — but NOT during the initial build from the constructor `seed`, so the
 * caller can post the seed VERBATIM on first paint (`read()` is unreliable until the
 * tree is connected: p9r-select `.value` is not yet populated).
 */
export function makeDataShapeTree(
    seed: DataShape | undefined,
    onChange: () => void,
    labels?: { define?: string; remove?: string; root?: string },
): { element: HTMLElement; read: () => DataShape | undefined } {
    const defineLabel = labels?.define ?? '+ Define request body';
    const removeLabel = labels?.remove ?? 'Remove body';
    const rootLabel = labels?.root ?? 'Root type';

    const element = document.createElement('div');
    let root: NodeHandle | null = null;

    const showEmpty = () => {
        root = null;
        const define = document.createElement('button');
        define.type = 'button';
        define.className = 'ep-add-param';
        define.dataset.role = 'define-body';
        define.textContent = defineLabel;
        define.addEventListener('click', () => { showTree({ type: 'object' }); onChange(); });
        element.replaceChildren(define);
    };

    const showTree = (s: DataShape) => {
        root = makeNode(s, onChange, 0);
        const head = document.createElement('div');
        head.className = 'ep-root-head';
        const label = document.createElement('span');
        label.className = 'ep-meta';
        label.textContent = rootLabel;
        head.append(label, root.typeEl);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ep-remove-body';
        remove.textContent = removeLabel;
        remove.addEventListener('click', () => { showEmpty(); onChange(); });
        element.replaceChildren(head, root.childrenEl, remove);
    };

    if (seed) showTree(seed); else showEmpty();

    return { element, read: () => root?.read() };
}
