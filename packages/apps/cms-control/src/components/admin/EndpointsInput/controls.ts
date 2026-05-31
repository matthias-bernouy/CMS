import { HTTP_METHODS } from "@bernouy/cms-gateway";
import { ICON_PLUS, ICON_TRASH } from "./icons";

/** A p9r-input. Empty name → no `name` (UI-only control, e.g. a body field name
 *  that's serialised inside a JSON blob); empty label → no label (compact rows). */
export function makeInput(name: string, label: string, placeholder: string, value?: string): HTMLElement {
    const input = document.createElement('p9r-input');
    if (name) input.setAttribute('name', name);
    if (label) input.setAttribute('label', label);
    input.setAttribute('placeholder', placeholder);
    if (value != null) input.setAttribute('value', value);
    return input;
}

/** A p9r-select from a fixed option list, seeded + coerced to a known value.
 *  Empty name → no `name` (UI-only control); empty label → compact (no label). */
export function makeSelect(values: readonly string[], value?: string, opts: { name?: string; label?: string } = {}): HTMLElement {
    const select = document.createElement('p9r-select');
    if (opts.name) select.setAttribute('name', opts.name);
    select.setAttribute('label', opts.label ?? '');
    for (const v of values) {
        const o = select.appendChild(document.createElement('option'));
        o.value = v;
        o.textContent = v;
    }
    select.setAttribute('value', value && values.includes(value) ? value : values[0]!);
    return select;
}

/** The HTTP-method select. */
export const makeMethodSelect = (name: string, value?: string): HTMLElement =>
    makeSelect(HTTP_METHODS, value, { name, label: 'Method' });

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

/** A ghost/danger icon-only button (delete endpoint, remove row/property).
 *  `action` wires the host's delegated handler, `onClick` a direct listener,
 *  `slot` places it (e.g. the accordion header's `header-actions`). */
export function makeIconButton(
    svg: string,
    opts: { ariaLabel: string; action?: string; onClick?: () => void; slot?: string },
): HTMLElement {
    const btn = document.createElement('p9r-icon-button');
    btn.setAttribute('variant', 'ghost');
    btn.setAttribute('color', 'danger');
    btn.setAttribute('size', 'sm');
    btn.setAttribute('aria-label', opts.ariaLabel);
    if (opts.slot) btn.setAttribute('slot', opts.slot);
    if (opts.action) btn.dataset.action = opts.action;
    if (opts.onClick) btn.addEventListener('click', opts.onClick);
    btn.innerHTML = svg;
    return btn;
}

/** Icon-only delete in the accordion header's `header-actions` slot — a sibling
 *  of the toggle buttons, so it neither nests nor toggles. */
export const makeDeleteButton = (): HTMLElement =>
    makeIconButton(ICON_TRASH, { ariaLabel: 'Delete endpoint', slot: 'header-actions', action: 'remove-endpoint' });

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
