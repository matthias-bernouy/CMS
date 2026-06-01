import { makeDataShapeTree } from "./dataShapeTree";
import { jsonField } from "./shared";
import type { DataShape } from "@bernouy/cms-gateway";

/**
 * The "Body" sub-section of the In tab: a thin wrapper that owns the hidden
 * `endpoints.<ei>.body` JSON field and wires it to a reusable DataShape-tree
 * widget (see `dataShapeTree.ts`). The body is optional: absent until defined,
 * removable back to absent (empty field → the parser stores no body).
 */
export function makeBodySection(ei: number, seedBody?: DataShape): HTMLElement {
    const container = document.createElement('div');
    container.dataset.role = 'body';

    const field = jsonField(`endpoints.${ei}.body`);
    const tree = makeDataShapeTree(seedBody, () => field.sync(() => tree.read()));
    tree.element.dataset.role = 'body-slot';

    // Initial value = the seed verbatim: `read()` is unreliable until the tree is
    // connected (p9r-select `.value` not yet populated). Edits then sync via read().
    field.sync(() => seedBody);

    container.append(field, tree.element);
    return container;
}
