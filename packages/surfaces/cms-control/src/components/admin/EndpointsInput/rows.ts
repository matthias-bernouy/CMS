import { HTTP_METHODS } from "@bernouy/cms-sources/browser";
import { makeInput, makeMethodSelect, makeDeleteButton } from "./controls";
import { makeInPanel } from "./inPanel";
import { makeOutPanel } from "./outPanel";
import { makeHeadersPanel } from "./headersPanel";
import { readControl, methodColor, type EndpointSeed } from "./shared";

/** Build one endpoint as a collapsible `<p9r-accordion-item>`: a live-synced
 *  collapsed-header summary (method tag + id + path), a header-actions delete
 *  button, and a `<p9r-tabs>` body (Infos / In / Out / Headers). Always returned
 *  COLLAPSED so no accordion height transition fires on insert. `api` is the
 *  secrets API base forwarded to the Headers tab's credential pickers. */
export function makeEndpointRow(idx: number, seed: EndpointSeed = {}, api?: string): HTMLElement {
    // Coerce the method once so the header tag and select never disagree on load.
    const method = seed.method && (HTTP_METHODS as readonly string[]).includes(seed.method)
        ? seed.method : HTTP_METHODS[0];

    const item = document.createElement('p9r-accordion-item');
    item.dataset.role = 'endpoint-row';

    // ── Collapsed-header summary (slot="header") ──
    const header = document.createElement('span');
    header.className = 'ep-header';
    header.setAttribute('slot', 'header');

    const methodTag = document.createElement('p9r-tag');
    methodTag.dataset.display = 'method';
    methodTag.setAttribute('color', methodColor(method));
    methodTag.textContent = method;

    const idEl = document.createElement('strong');
    idEl.className = 'ep-id';
    idEl.dataset.display = 'endpointId';
    idEl.textContent = seed.endpointId || '(new endpoint)';

    const pathEl = document.createElement('span');
    pathEl.className = 'ep-path';
    pathEl.dataset.display = 'targetUrl';
    pathEl.textContent = seed.targetUrl || '';

    header.append(methodTag, idEl, pathEl);

    // ── Body: a tabs shell (the three fields live in "Infos") ──
    const tabs = document.createElement('p9r-tabs');
    const infos = document.createElement('p9r-tab-panel');
    infos.id = `infos-${idx}`;
    infos.setAttribute('label', 'Infos');
    const infosBody = document.createElement('p9r-stack');
    infosBody.setAttribute('gap', 'm');
    const idInput = makeInput(`endpoints.${idx}.endpointId`, 'SourceEndpoint id', 'getUser', seed.endpointId);
    const methodSelect = makeMethodSelect(`endpoints.${idx}.method`, method);
    const urlInput = makeInput(`endpoints.${idx}.targetUrl`, 'Target URL', 'https://api.example.com/path', seed.targetUrl);
    infosBody.append(idInput, methodSelect, urlInput);
    infos.appendChild(infosBody);

    tabs.append(
        infos,
        makeInPanel(idx, seed, urlInput),
        makeOutPanel(idx, seed),
        makeHeadersPanel(idx, seed, { api }),
    );
    tabs.setAttribute('active', `infos-${idx}`);   // panels already appended → no first-rebuild race

    item.append(header, makeDeleteButton(), tabs);
    bindHeaderSync(methodTag, idEl, pathEl, idInput, methodSelect, urlInput);
    return item;
}

/** Keep the collapsed-header summary in sync with the body controls. `input`
 *  crosses the input's shadow (composed) and p9r-select re-dispatches `change`
 *  on its host — both on each control covers every edit. */
function bindHeaderSync(
    methodTag: Element, idEl: Element, pathEl: Element,
    idInput: Element, methodSelect: Element, urlInput: Element,
): void {
    const update = () => {
        const m = readControl(methodSelect) || HTTP_METHODS[0];
        methodTag.textContent = m;
        methodTag.setAttribute('color', methodColor(m));
        idEl.textContent = readControl(idInput).trim() || '(new endpoint)';
        pathEl.textContent = readControl(urlInput);
    };
    for (const el of [idInput, methodSelect, urlInput]) {
        el.addEventListener('input', update);
        el.addEventListener('change', update);
    }
}
