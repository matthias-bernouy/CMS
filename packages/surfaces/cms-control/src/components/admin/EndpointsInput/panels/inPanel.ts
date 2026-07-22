import { renderPathParams } from "../fields/pathParams";
import { makeQueryParamRow, readQueryParamRow } from "../rows/queryRow";
import { makeBodySection } from "../editors/bodyEditor";
import { jsonField, type EndpointSeed } from "../shared";

/** The "In" tab: read-only Path params (auto-detected from the URL), an editable
 *  Query params editor, and the recursive Body shape editor. Every structured
 *  field posts as ONE JSON blob (`endpoints.<i>.{params,body,output,meta}`) — the
 *  editor builds it, the parser validates it. Path rows re-render live from the URL. */
export function makeInPanel(endpointIdx: number, seed: EndpointSeed, urlInput: HTMLElement): HTMLElement {
    const seedParams = seed.params ?? [];
    const panel = document.createElement("p9r-tab-panel");
    panel.id = `in-${endpointIdx}`;
    panel.setAttribute("label", "In");

    const wrap = document.createElement("p9r-stack");
    wrap.setAttribute("gap", "m");

    // ── Path params — derived from the URL `{placeholders}`, kept in sync ──
    const pathContainer = document.createElement("div");
    pathContainer.dataset.role = "path-params";
    // Live `.value` when the input is upgraded; fall back to the `value` attribute
    // (the seed, and so rows render under test where p9r-input isn't registered).
    const renderPath = () => {
        const live = (urlInput as unknown as { value?: string }).value;
        renderPathParams(pathContainer, typeof live === "string" ? live : (urlInput.getAttribute("value") ?? ""));
    };
    renderPath();
    urlInput.addEventListener("input", renderPath);
    urlInput.addEventListener("change", renderPath);

    // ── Query params — UI rows synced into one `endpoints.<i>.params` JSON blob ──
    const queryParams = seedParams.filter((p) => (p.in ?? "query") === "query");
    const container = document.createElement("div");
    container.dataset.role = "query-params";

    const paramsField = jsonField(`endpoints.${endpointIdx}.params`);
    const rows = document.createElement("p9r-stack");
    rows.setAttribute("gap", "sm");
    rows.dataset.role = "query-param-rows";

    const readRows = () =>
        Array.from(rows.querySelectorAll<HTMLElement>('[data-role="query-param-row"]'), readQueryParamRow).filter(
            (p): p is NonNullable<typeof p> => p !== null,
        );
    const sync = () => paramsField.sync(readRows);

    queryParams.forEach((p) => rows.appendChild(makeQueryParamRow(p, sync)));

    const add = document.createElement("button");
    add.type = "button";
    add.className = "ep-add-param";
    add.dataset.role = "add-query-param";
    add.textContent = "+ Add query param";
    add.addEventListener("click", () => {
        rows.appendChild(makeQueryParamRow({}, sync));
        sync();
    });

    // Initial value = the seed verbatim: read() is unreliable until the rows are
    // connected (p9r-select `.value` isn't populated yet); edits then sync().
    paramsField.sync(() => queryParams);

    container.append(paramsField, rows, add);
    wrap.append(
        heading("Path params"),
        pathContainer,
        heading("Query params"),
        container,
        heading("Body"),
        makeBodySection(endpointIdx, seed.body),
        // Editor-less endpoint meta — round-tripped verbatim (B1). Output is owned by
        // the Out panel; headers by the Headers panel.
        passthrough(`endpoints.${endpointIdx}.meta`, "meta-passthrough", seed.meta),
    );
    panel.appendChild(wrap);
    return panel;
}

/** A hidden field round-tripping an editor-less seed value verbatim. */
function passthrough(name: string, role: string, seed: unknown): HTMLElement {
    const f = jsonField(name, role);
    f.sync(() => seed);
    return f;
}

function heading(text: string): HTMLElement {
    const h = document.createElement("strong");
    h.className = "ep-heading";
    h.textContent = text;
    return h;
}
