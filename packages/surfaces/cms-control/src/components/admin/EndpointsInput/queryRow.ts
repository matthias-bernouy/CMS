import { makeInput, makeSelect, makeRequiredCheckbox, makeIconButton, ICON_X } from "./controls";
import { PARAM_TYPES, readControl, type ParamSeed } from "./shared";

/** A query param as it appears in the `endpoints.<i>.params` JSON blob. */
export type QueryParam = { name: string; in: "query"; type: string; required: boolean; description?: string };

/** One editable query-param row — UI-only (no form names). Its values are read
 *  back into the endpoint's `params` JSON blob by `onChange`. The (editor-less)
 *  description rides on a data attribute so it round-trips. */
export function makeQueryParamRow(seed: ParamSeed, onChange: () => void): HTMLElement {
    const row = document.createElement('p9r-stack');
    row.setAttribute('direction', 'row');
    row.setAttribute('gap', 'sm');
    row.setAttribute('align', 'center');
    row.dataset.role = 'query-param-row';
    if (seed.description) row.dataset.description = seed.description;

    const name = makeInput('', '', 'param name', seed.name);
    name.className = 'ep-name';
    name.dataset.role = 'param-name';
    name.addEventListener('input', onChange);

    const type = makeSelect(PARAM_TYPES, seed.type);
    type.className = 'ep-type';
    type.dataset.role = 'param-type';
    type.addEventListener('change', onChange);

    const req = makeRequiredCheckbox(!!seed.required, onChange);

    const remove = makeIconButton(ICON_X, {
        ariaLabel: 'Remove param',
        onClick: () => { row.remove(); onChange(); },
    });

    row.append(name, type, req, remove);
    return row;
}

/** Read one row into a `QueryParam`, or `null` when the name is blank (unfilled). */
export function readQueryParamRow(row: HTMLElement): QueryParam | null {
    const name = readControl(row.querySelector('[data-role="param-name"]')!).trim();
    if (!name) return null;
    const type = readControl(row.querySelector('[data-role="param-type"]')!);
    const required = row.querySelector('[data-role="required"]')!.hasAttribute('checked');
    const description = row.dataset.description;
    return { name, in: "query", type, required, ...(description ? { description } : {}) };
}
