import { makeHeaderRow, type HeaderRowHandle } from "./headerRow";
import { jsonField, type EndpointSeed } from "./shared";
import type { EndpointHeader } from "@bernouy/cms-sources";

/** The "Headers" tab: the editable request-header list serialised into ONE JSON
 *  blob `endpoints.<i>.headers` (an `EndpointHeader[]`). Each row is a header name
 *  + a static/secret source. Mirrors the Out tab: rows own their own add/remove/sync
 *  (self-managed, not routed through the host's `_onClick` delegation). The credential
 *  picker's secrets API base is forwarded from `opts.api`. */
export function makeHeadersPanel(endpointIdx: number, seed: EndpointSeed, opts?: { api?: string }): HTMLElement {
    const panel = document.createElement('p9r-tab-panel');
    panel.id = `headers-${endpointIdx}`;
    panel.setAttribute('label', 'Headers');

    const wrap = document.createElement('p9r-stack');
    wrap.setAttribute('gap', 'm');

    const field = jsonField(`endpoints.${endpointIdx}.headers`);
    const rows = document.createElement('p9r-stack');
    rows.setAttribute('gap', 'sm');
    rows.dataset.role = 'header-rows';

    // Each row keeps its own `read` closure (the source toggle's value can't be
    // re-derived from the DOM), so the list maps over handles, not the DOM. Removal
    // must therefore splice the handle too — else a deleted row leaks back in.
    const handles: HeaderRowHandle[] = [];
    const readRows = () => handles.map(h => h.read())
        .filter((r): r is NonNullable<typeof r> => r !== null);
    const sync = () => field.sync(readRows);

    const addRow = (h: Partial<EndpointHeader>) => {
        const handle = makeHeaderRow(h, sync, () => {
            const i = handles.indexOf(handle);
            if (i >= 0) handles.splice(i, 1);
            handle.element.remove();
            sync();
        }, opts);
        handles.push(handle);
        rows.appendChild(handle.element);
    };
    (seed.headers ?? []).forEach(addRow);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'ep-add-param';
    add.dataset.role = 'add-header';
    add.textContent = '+ Add header';
    add.addEventListener('click', () => { addRow({}); sync(); });

    // Initial value = the seed verbatim: read() is unreliable until the rows are
    // connected (p9r-select `.value` isn't populated yet); edits then sync().
    field.sync(() => seed.headers);

    wrap.append(field, heading('Headers'), rows, add);
    panel.appendChild(wrap);
    return panel;
}

function heading(text: string): HTMLElement {
    const h = document.createElement('strong');
    h.className = 'ep-heading';
    h.textContent = text;
    return h;
}
