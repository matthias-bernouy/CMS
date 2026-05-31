import { makeInput, makeSelect, makeIconButton } from "./controls";
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

    // Description isn't editable yet but is round-tripped so a save never wipes it.
    const hiddenDesc = document.createElement('input');
    hiddenDesc.type = 'hidden';
    hiddenDesc.name = `endpoints.${ei}.params.${pi}.description`;
    if (seed.description) hiddenDesc.value = seed.description;

    const type = makeSelect(PARAM_TYPES, seed.type, { name: `endpoints.${ei}.params.${pi}.type` });
    type.className = 'ep-type';

    // The cms-blocs checkbox slots its own label inside the native <label> that
    // wraps the box, so clicking the box or the "Required" text toggles it.
    const req = document.createElement('w13c-checkbox');
    req.className = 'ep-required';
    req.setAttribute('name', `endpoints.${ei}.params.${pi}.required`);
    req.setAttribute('value', 'true');
    if (seed.required) req.setAttribute('checked', '');
    req.textContent = 'Required';

    const remove = makeIconButton(ICON_X, { ariaLabel: 'Remove param', action: 'remove-query-param' });

    row.append(name, hiddenIn, hiddenDesc, type, req, remove);
    return row;
}
