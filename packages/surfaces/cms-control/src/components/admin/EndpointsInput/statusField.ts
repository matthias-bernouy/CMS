import { isValidResponseStatus } from "@bernouy/cms-sources/browser";
import { readControl } from "./shared";

/** Common HTTP status codes offered in the response-status chooser. */
export const COMMON = [
    "200", "201", "202", "204", "301", "302", "304", "400", "401",
    "403", "404", "409", "422", "429", "500", "502", "503",
] as const;

/** Sentinel select value that switches the row into free-text ("custom") mode. */
const CUSTOM = "custom";

/** Build a `<p9r-select>` with distinct option labels (which `makeSelect` can't do):
 *  an empty "Status…" placeholder, the common codes, "default", then "Custom…". */
function buildSelect(value: string): HTMLElement {
    const select = document.createElement('p9r-select');
    select.dataset.role = 'response-status';
    select.className = 'ep-status';
    select.setAttribute('label', '');
    const opt = (v: string, label: string) => {
        const o = select.appendChild(document.createElement('option'));
        o.value = v;
        o.textContent = label;
    };
    opt("", "Status…");
    for (const c of COMMON) opt(c, c);
    opt("default", "default");
    opt(CUSTOM, "Custom…");
    select.setAttribute('value', value);
    return select;
}

/** The response-status chooser: a p9r-select of common codes + a "Custom…" mode
 *  that reveals a free-text p9r-input (validated 100–599 or "default"). Both controls
 *  are built ONCE; switching modes only toggles the input's visibility — the select is
 *  NEVER reparented (moving a p9r-select would reset its value). Mirrors `bodyNode`'s
 *  value-attribute mitigation: on change we set the select's `value` attr so a re-slot
 *  can't reset it. */
export function makeStatusField(
    seed: string | undefined,
    onChange: () => void,
): { element: HTMLElement; read: () => string | null } {
    const custom = seed != null && seed !== "" && !([...COMMON, "default"] as string[]).includes(seed);
    const select = buildSelect(custom ? CUSTOM : (seed ?? ""));

    const input = document.createElement('p9r-input');
    input.dataset.role = 'response-status-custom';
    input.className = 'ep-status';
    input.setAttribute('placeholder', 'e.g. 418');
    if (custom) input.setAttribute('value', seed!);
    input.style.display = custom ? '' : 'none';

    const validate = () => {
        const v = readControl(input).trim();
        // Only the visible custom input can be invalid; leaving custom mode clears it.
        if (readControl(select) === CUSTOM && v && !isValidResponseStatus(v)) {
            input.setAttribute('invalid', '');
            input.setAttribute('hint', 'Code 100-599 or "default"');
            input.setAttribute('hint-level', 'error');
        } else {
            input.removeAttribute('invalid');
            input.removeAttribute('hint');
            input.removeAttribute('hint-level');
        }
    };

    select.addEventListener('change', () => {
        const v = readControl(select);
        select.setAttribute('value', v);   // keep attr in sync so a re-slot can't reset it
        input.style.display = v === CUSTOM ? '' : 'none';
        validate();   // clears any stale error when leaving custom mode
        onChange();
    });
    input.addEventListener('input', () => { validate(); onChange(); });
    if (custom) validate();

    const element = document.createElement('p9r-stack');
    element.setAttribute('direction', 'row');
    element.setAttribute('gap', 'sm');
    element.setAttribute('align', 'center');
    element.append(select, input);

    const read = (): string | null => {
        const sel = readControl(select);
        if (sel === CUSTOM) {
            const v = readControl(input).trim();
            return v || null;
        }
        return sel || null;
    };

    return { element, read };
}
