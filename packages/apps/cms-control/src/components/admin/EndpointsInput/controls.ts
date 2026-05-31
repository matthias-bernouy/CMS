import { HTTP_METHODS } from "@bernouy/cms-gateway";
import { ICON_PLUS, ICON_TRASH } from "./icons";

/** A p9r-input. Empty label → no `label` attribute (compact rows). */
export function makeInput(name: string, label: string, placeholder: string, value?: string): HTMLElement {
    const input = document.createElement('p9r-input');
    input.setAttribute('name', name);
    if (label) input.setAttribute('label', label);
    input.setAttribute('placeholder', placeholder);
    if (value != null) input.setAttribute('value', value);
    return input;
}

/** The HTTP-method p9r-select, seeded + coerced to a known method. */
export function makeMethodSelect(name: string, value?: string): HTMLElement {
    const select = document.createElement('p9r-select');
    select.setAttribute('name', name);
    select.setAttribute('label', 'Method');
    for (const m of HTTP_METHODS) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    }
    const initial = value && (HTTP_METHODS as readonly string[]).includes(value) ? value : HTTP_METHODS[0];
    select.setAttribute('value', initial);
    return select;
}

/** A disabled tab panel for a feature not built yet (output / rules). */
export function makeDeferredPanel(id: string, label: string): HTMLElement {
    const panel = document.createElement('p9r-tab-panel');
    panel.id = id;
    panel.setAttribute('label', label);
    panel.setAttribute('disabled', '');
    const note = document.createElement('p');
    note.className = 'ep-hint';
    note.textContent = 'Soon.';
    panel.appendChild(note);
    return panel;
}

/** Icon-only delete in the accordion header's `header-actions` slot — a sibling
 *  of the toggle buttons, so it neither nests nor toggles. */
export function makeDeleteButton(): HTMLElement {
    const btn = document.createElement('p9r-icon-button');
    btn.setAttribute('slot', 'header-actions');
    btn.setAttribute('variant', 'ghost');
    btn.setAttribute('color', 'danger');
    btn.setAttribute('size', 'sm');
    btn.setAttribute('aria-label', 'Delete endpoint');
    btn.dataset.action = 'remove-endpoint';
    btn.innerHTML = ICON_TRASH;
    return btn;
}

/** Full-width dashed "add endpoint" affordance (native button → never submits;
 *  hover is handled in CSS). */
export function makeAddButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ep-add';
    btn.dataset.action = 'add-endpoint';
    btn.innerHTML = `${ICON_PLUS} Add endpoint`;
    return btn;
}
