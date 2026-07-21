import { extractPathParamNames } from "@bernouy/cms-sources/browser";

/**
 * Path params — derived (not posted) from the Target URL's `{placeholders}`.
 * The URL is the single source of truth: the server-side `pathParamsFromUrl`
 * derives them on submit, so these rows are display-only and re-render live as
 * the URL changes.
 */

export const extractPathNames = extractPathParamNames;

/** A read-only path-param row: the name (from the URL, not editable), a fixed
 *  `string` type and a `required` marker. No form fields are emitted. */
function makePathParamRow(name: string): HTMLElement {
    const row = document.createElement("p9r-stack");
    row.setAttribute("direction", "row");
    row.setAttribute("gap", "sm");
    row.setAttribute("align", "center");
    row.dataset.role = "path-param-row";
    row.dataset.paramName = name;

    const nameEl = document.createElement("code");
    nameEl.className = "ep-path-name";
    nameEl.textContent = name;

    const type = document.createElement("span");
    type.className = "ep-meta";
    type.textContent = "string";

    const req = document.createElement("span");
    req.className = "ep-meta";
    req.textContent = "required";

    row.append(nameEl, type, req);
    return row;
}

/** (Re)render the read-only path-param rows for the current URL. */
export function renderPathParams(container: HTMLElement, targetUrl: string): void {
    const names = extractPathNames(targetUrl);
    container.replaceChildren();
    if (!names.length) {
        const hint = document.createElement("p");
        hint.className = "ep-hint";
        hint.textContent = "Add {placeholders} to the Target URL to declare path params.";
        container.appendChild(hint);
        return;
    }
    const rows = document.createElement("p9r-stack");
    rows.setAttribute("gap", "sm");
    names.forEach((n) => rows.appendChild(makePathParamRow(n)));
    container.appendChild(rows);
}
