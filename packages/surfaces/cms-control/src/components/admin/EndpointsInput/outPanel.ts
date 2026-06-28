import { makeResponseRow, type ResponseRowHandle } from "./responseRow";
import { jsonField, type EndpointSeed } from "./shared";
import type { DataShape } from "@bernouy/cms-sources";

/** The "Out" tab: the editable response contract — a per-status list serialised
 *  into ONE JSON blob `endpoints.<i>.output` (an `EndpointResponse[]`). Each row
 *  is a status code + an optional body (the reusable DataShape tree). Mirrors the
 *  In tab's query-params section: rows own their own add/remove/sync (self-managed,
 *  not routed through the host's `_onClick` delegation). */
export function makeOutPanel(endpointIdx: number, seed: EndpointSeed): HTMLElement {
    const panel = document.createElement('p9r-tab-panel');
    panel.id = `out-${endpointIdx}`;
    panel.setAttribute('label', 'Out');

    const wrap = document.createElement('p9r-stack');
    wrap.setAttribute('gap', 'm');

    const field = jsonField(`endpoints.${endpointIdx}.output`);
    const rows = document.createElement('p9r-stack');
    rows.setAttribute('gap', 'sm');
    rows.dataset.role = 'response-rows';

    // Each row keeps its own `read` closure (the body tree's `read()` can't be
    // re-derived from the DOM), so the list maps over handles, not the DOM. Removal
    // must therefore splice the handle too — else a deleted row leaks back in.
    const handles: ResponseRowHandle[] = [];
    const readRows = () => handles.map(h => h.read())
        .filter((r): r is NonNullable<typeof r> => r !== null);
    const sync = () => field.sync(readRows);

    const addRow = (r: { status?: string; body?: DataShape }) => {
        const handle = makeResponseRow(r, sync, () => {
            const i = handles.indexOf(handle);
            if (i >= 0) handles.splice(i, 1);
            handle.element.remove();
            sync();
        });
        handles.push(handle);
        rows.appendChild(handle.element);
    };
    (seed.output ?? []).forEach(addRow);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'ep-add-param';
    add.dataset.role = 'add-response';
    add.textContent = '+ Add response';
    add.addEventListener('click', () => { addRow({}); sync(); });

    // Initial value = the seed verbatim: read() is unreliable until the rows are
    // connected (p9r-select `.value` isn't populated yet); edits then sync().
    field.sync(() => seed.output);

    wrap.append(field, heading('Responses'), rows, add);
    panel.appendChild(wrap);
    return panel;
}

function heading(text: string): HTMLElement {
    const h = document.createElement('strong');
    h.className = 'ep-heading';
    h.textContent = text;
    return h;
}
