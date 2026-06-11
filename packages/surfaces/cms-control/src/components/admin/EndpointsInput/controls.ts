import { HTTP_METHODS } from "@bernouy/cms-gateway/browser";

/** Inline SVG fragments (set via `innerHTML`), shared by the icon buttons below. */
const ICON_SVG = (paths: string, size = 16) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const ICON_PLUS = ICON_SVG('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18);
export const ICON_X = ICON_SVG('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
export const ICON_TRASH = ICON_SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');

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

/** A "Required" toggle — the same `w13c-checkbox` for query params and body
 *  fields. UI-only (no form name); its `checked` attribute is read back into the
 *  enclosing JSON blob. `onChange` fires on toggle so the section re-serialises. */
export function makeRequiredCheckbox(checked: boolean, onChange: () => void): HTMLElement {
    const cb = document.createElement('w13c-checkbox');
    cb.dataset.role = 'required';
    cb.className = 'ep-required';
    if (checked) cb.setAttribute('checked', '');
    cb.textContent = 'Required';
    cb.addEventListener('change', onChange);
    return cb;
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
