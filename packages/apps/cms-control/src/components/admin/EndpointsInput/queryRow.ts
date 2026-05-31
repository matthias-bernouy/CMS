import { makeInput } from "./controls";
import { PARAM_TYPES, type ParamSeed } from "./shared";
import { ICON_X } from "./icons";

/** One editable query-param row: name + type + a `required` checkbox + remove.
 *  Serializes as `endpoints.<ei>.params.<pi>.{name,in,type,required}` with a
 *  hidden `in="query"`; the parser reconstructs these into `input.params`. */
export function makeQueryParamRow(ei: number, pi: number, seed: ParamSeed = {}): HTMLElement {
    const row = document.createElement('p9r-stack');
    row.setAttribute('direction', 'row');
    row.setAttribute('gap', 'sm');
    row.setAttribute('align', 'center');
    row.dataset.role = 'query-param-row';

    const name = makeInput(`endpoints.${ei}.params.${pi}.name`, '', 'param name', seed.name);
    name.className = 'ep-name';

    const hiddenIn = document.createElement('input');
    hiddenIn.type = 'hidden';
    hiddenIn.name = `endpoints.${ei}.params.${pi}.in`;
    hiddenIn.value = 'query';

    const type = document.createElement('p9r-select');
    type.className = 'ep-type';
    type.setAttribute('name', `endpoints.${ei}.params.${pi}.type`);
    type.setAttribute('label', '');
    for (const t of PARAM_TYPES) {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        type.appendChild(o);
    }
    const t0 = seed.type && (PARAM_TYPES as readonly string[]).includes(seed.type) ? seed.type : PARAM_TYPES[0];
    type.setAttribute('value', t0);

    // The cms-blocs checkbox slots its own label inside the native <label> that
    // wraps the box, so clicking the box or the "Required" text toggles it.
    const req = document.createElement('w13c-checkbox');
    req.className = 'ep-required';
    req.setAttribute('name', `endpoints.${ei}.params.${pi}.required`);
    req.setAttribute('value', 'true');
    if (seed.required) req.setAttribute('checked', '');
    req.textContent = 'Required';

    const remove = document.createElement('p9r-icon-button');
    remove.setAttribute('variant', 'ghost');
    remove.setAttribute('color', 'danger');
    remove.setAttribute('size', 'sm');
    remove.setAttribute('aria-label', 'Remove param');
    remove.dataset.action = 'remove-query-param';
    remove.innerHTML = ICON_X;

    row.append(name, hiddenIn, type, req, remove);
    return row;
}
