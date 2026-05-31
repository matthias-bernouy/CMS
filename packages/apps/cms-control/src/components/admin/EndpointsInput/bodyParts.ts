import { SHAPE_TYPES } from "./shared";
import { makeSelect, makeIconButton } from "./controls";
import { ICON_X } from "./icons";

/** The shape-type picker (string/number/boolean/object/array). UI-only (no form
 *  name — the body posts as one JSON blob). */
export function makeTypeSelect(value: string): HTMLElement {
    const select = makeSelect(SHAPE_TYPES, value);
    select.dataset.role = 'node-type';
    select.className = 'ep-type';
    return select;
}

/** A "Required" toggle. Uses the same `w13c-checkbox` as the query-param rows for
 *  consistency. UI-only (no form name — read back into the parent object's
 *  `required[]` via its `checked` attribute on `change`). */
export function makeRequiredCheckbox(checked: boolean, onChange: () => void): HTMLElement {
    const cb = document.createElement('w13c-checkbox');
    cb.dataset.role = 'required';
    cb.className = 'ep-required';
    if (checked) cb.setAttribute('checked', '');
    cb.textContent = 'Required';
    cb.addEventListener('change', onChange);
    return cb;
}

/** A subtle icon-only trash button for removing a property. */
export const makeTrash = (onClick: () => void): HTMLElement =>
    makeIconButton(ICON_X, { ariaLabel: 'Remove property', onClick });

/** A bordered "+ Add property" button. `setLabel` retargets it to the owning
 *  property name (e.g. "+ Add property to \"user\"") as that name is edited. */
export function makeAddPropButton(onClick: () => void): HTMLElement & { setLabel(name: string): void } {
    const btn = document.createElement('button') as HTMLButtonElement & { setLabel(name: string): void };
    btn.type = 'button';
    btn.dataset.role = 'add-prop';
    btn.className = 'ep-add-prop';
    btn.setLabel = (name: string) => { btn.textContent = name ? `+ Add property to "${name}"` : '+ Add property'; };
    btn.setLabel('');
    btn.addEventListener('click', onClick);
    return btn;
}
