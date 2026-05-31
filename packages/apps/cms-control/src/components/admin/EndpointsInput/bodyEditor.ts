import { makeNode, type NodeHandle } from "./bodyNode";
import type { DataShape, GatewayMeta } from "@bernouy/cms-gateway";

/**
 * The "Body" sub-section of the In tab. A recursive DataShape tree (see
 * `bodyNode.ts`) serialised into ONE hidden `endpoints.<ei>.body` JSON field, kept
 * in sync on every edit. The body is optional: absent until defined, removable
 * back to absent (empty field → the parser stores no body).
 */
export function makeBodySection(ei: number, seedBody?: DataShape): HTMLElement {
    const container = document.createElement('div');
    container.dataset.role = 'body';

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = `endpoints.${ei}.body`;

    const slot = document.createElement('div');
    slot.dataset.role = 'body-slot';

    let root: NodeHandle | null = null;
    // Edits run after connection, where `read()` is reliable.
    const sync = () => { hidden.value = root ? JSON.stringify(root.read()) : ''; };

    const showEmpty = () => {
        root = null;
        hidden.value = '';
        const define = document.createElement('button');
        define.type = 'button';
        define.className = 'ep-add-param';
        define.dataset.role = 'define-body';
        define.textContent = '+ Define request body';
        define.addEventListener('click', () => showTree({ type: 'object' }));
        slot.replaceChildren(define);
    };

    const showTree = (seed: DataShape) => {
        root = makeNode(seed, sync, 0);
        const head = document.createElement('div');
        head.className = 'ep-root-head';
        const label = document.createElement('span');
        label.className = 'ep-meta';
        label.textContent = 'Root type';
        head.append(label, root.typeEl);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ep-remove-body';
        remove.textContent = 'Remove body';
        remove.addEventListener('click', showEmpty);
        slot.replaceChildren(head, root.childrenEl, remove);
        // Initial value = the seed verbatim: `read()` is unreliable until the tree
        // is connected (p9r-select `.value` not yet populated). Edits then sync().
        hidden.value = JSON.stringify(seed);
    };

    if (seedBody) showTree(seedBody); else showEmpty();

    container.append(hidden, slot);
    return container;
}

/** A hidden field round-tripping an editor-less value (the response shape or the
 *  endpoint meta) verbatim, so editing a provider never wipes it (part of B1). */
function makePassthrough(name: string, role: string, seed?: unknown): HTMLElement {
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = name;
    hidden.dataset.role = role;
    if (seed) hidden.value = JSON.stringify(seed);   // `.value` → picked up by FormData
    return hidden;
}

/** Round-trips the (editor-less) response shape. */
export const makeOutputField = (ei: number, seedOutput?: DataShape): HTMLElement =>
    makePassthrough(`endpoints.${ei}.output`, 'output-passthrough', seedOutput);

/** Round-trips the (editor-less) endpoint meta (name/description/icon). */
export const makeMetaField = (ei: number, seedMeta?: GatewayMeta): HTMLElement =>
    makePassthrough(`endpoints.${ei}.meta`, 'meta-passthrough', seedMeta);
