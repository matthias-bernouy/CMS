import { makeIconButton, ICON_X } from "./controls";
import { makeDataShapeTree } from "./dataShapeTree";
import { makeStatusField } from "./statusField";
import type { EndpointResponse } from "@bernouy/cms-sources";

/** Handle for one response row: its element + a `read()` that assembles the
 *  `EndpointResponse`. The body `read` is captured in the closure (it can't be
 *  re-derived from the DOM), so the row owns it rather than re-querying. */
export type ResponseRowHandle = {
    element: HTMLElement;
    read: () => EndpointResponse | null;
};

/** One editable response row — UI-only (no form names). A status input + an
 *  optional body via the reusable DataShape tree + a remove button. Edits funnel
 *  into the list-level `onChange` (the Out panel's `sync`); the trash button calls
 *  `onRemove`, which the panel uses to drop this row's handle AND its element (so a
 *  removed row stops contributing to the serialised list — not just the DOM). */
export function makeResponseRow(
    seed: Partial<EndpointResponse>,
    onChange: () => void,
    onRemove: () => void,
): ResponseRowHandle {
    const row = document.createElement('p9r-stack');
    row.setAttribute('gap', 'sm');
    row.dataset.role = 'response-row';

    // ── Status + remove on one line ──
    const head = document.createElement('p9r-stack');
    head.setAttribute('direction', 'row');
    head.setAttribute('gap', 'sm');
    head.setAttribute('align', 'center');

    const status = makeStatusField(seed.status, onChange);

    const remove = makeIconButton(ICON_X, {
        ariaLabel: 'Remove response',
        onClick: onRemove,
    });
    head.append(status.element, remove);

    // ── Body tree below ──
    const tree = makeDataShapeTree(seed.body, onChange, {
        define: '+ Define body', remove: 'Remove body', root: 'Body type',
    });
    tree.element.dataset.role = 'response-body';

    row.append(head, tree.element);

    const read = (): EndpointResponse | null => {
        const s = status.read();
        if (!s) return null;
        const body = tree.read();
        return {
            status: s,
            ...(body ? { body } : {}),
            ...(seed.triggerBody ? { triggerBody: seed.triggerBody } : {}),
        };
    };

    return { element: row, read };
}
