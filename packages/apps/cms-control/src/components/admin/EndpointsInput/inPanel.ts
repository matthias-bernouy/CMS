import { renderPathParams } from "./pathParams";
import { makeQueryParamRow } from "./queryRow";
import type { ParamSeed } from "./shared";

/** The "In" tab: read-only Path params (auto-detected from the URL) above an
 *  editable Query params editor. Path rows re-render live as the Target URL
 *  changes (cross-tab sync); query rows post their flat keys. */
export function makeInPanel(endpointIdx: number, seedParams: ParamSeed[], urlInput: HTMLElement): HTMLElement {
    const panel = document.createElement('p9r-tab-panel');
    panel.id = `in-${endpointIdx}`;
    panel.setAttribute('label', 'In');

    const wrap = document.createElement('p9r-stack');
    wrap.setAttribute('gap', 'm');

    // ── Path params — derived from the URL `{placeholders}`, kept in sync ──
    const pathContainer = document.createElement('div');
    pathContainer.dataset.role = 'path-params';
    // Live `.value` when the input is upgraded; fall back to the `value` attribute
    // (the seed, and so rows render under test where p9r-input isn't registered).
    const renderPath = () => {
        const live = (urlInput as unknown as { value?: string }).value;
        renderPathParams(pathContainer, typeof live === 'string' ? live : (urlInput.getAttribute('value') ?? ''));
    };
    renderPath();
    urlInput.addEventListener('input', renderPath);
    urlInput.addEventListener('change', renderPath);

    // ── Query params — editable rows ──
    const queryParams = seedParams.filter(p => (p.in ?? 'query') === 'query');
    const container = document.createElement('div');
    container.dataset.role = 'query-params';
    container.dataset.endpointIdx = String(endpointIdx);
    container.dataset.paramCount = String(queryParams.length);

    const rows = document.createElement('p9r-stack');
    rows.setAttribute('gap', 'sm');
    rows.dataset.role = 'query-param-rows';
    queryParams.forEach((p, j) => rows.appendChild(makeQueryParamRow(endpointIdx, j, p)));

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'ep-add-param';
    add.dataset.action = 'add-query-param';
    add.textContent = '+ Add query param';

    container.append(rows, add);
    wrap.append(heading('Path params'), pathContainer, heading('Query params'), container);
    panel.appendChild(wrap);
    return panel;
}

/** Append a fresh (empty) query-param row; the per-endpoint param index is an
 *  increment-only counter so removals leave gaps the parser compacts. */
export function addQueryParam(container: HTMLElement | null): void {
    if (!container) return;
    const ei = Number(container.dataset.endpointIdx);
    const pi = Number(container.dataset.paramCount ?? '0');
    container.dataset.paramCount = String(pi + 1);
    container.querySelector('[data-role="query-param-rows"]')?.appendChild(makeQueryParamRow(ei, pi));
}

function heading(text: string): HTMLElement {
    const h = document.createElement('strong');
    h.className = 'ep-heading';
    h.textContent = text;
    return h;
}
