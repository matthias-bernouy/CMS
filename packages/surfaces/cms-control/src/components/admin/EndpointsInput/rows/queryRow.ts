import { makeInput, makeSelect, makeRequiredCheckbox, makeIconButton, ICON_X } from "../fields/controls";
import { PARAM_TYPES, readControl, type ParamSeed } from "../shared";
import { COMPUTED_PARAM_REFS, type ComputedParamRef, type ParamValueSource } from "@bernouy/cms-sources/browser";

/** A query param as it appears in the `endpoints.<i>.params` JSON blob. */
export type QueryParam = {
    name: string;
    in: "query";
    type: string;
    required: boolean;
    description?: string;
    source?: ParamValueSource;
};

/** One editable query-param row — UI-only (no form names). Its values are read
 *  back into the endpoint's `params` JSON blob by `onChange`. The (editor-less)
 *  description rides on a data attribute so it round-trips. */
export function makeQueryParamRow(seed: ParamSeed, onChange: () => void): HTMLElement {
    const row = document.createElement("p9r-stack");
    row.setAttribute("direction", "row");
    row.setAttribute("gap", "sm");
    row.setAttribute("align", "center");
    row.className = "ep-query-row";
    row.dataset.role = "query-param-row";
    if (seed.description) {
        row.dataset.description = seed.description;
    }

    const name = makeInput("", "", "param name", seed.name);
    name.className = "ep-name";
    name.dataset.role = "param-name";
    name.addEventListener("input", onChange);

    const type = makeSelect([...PARAM_TYPES, "computed"], seed.source?.from === "computed" ? "computed" : seed.type);
    type.className = "ep-type";
    type.dataset.role = "param-type";
    type.addEventListener("change", () => {
        syncComputedVisibility();
        onChange();
    });

    const req = makeRequiredCheckbox(!!seed.required, onChange);

    const computed = makeSelect(
        [...COMPUTED_PARAM_REFS],
        seed.source?.from === "computed" ? seed.source.ref : "userID",
    );
    computed.className = "ep-computed";
    computed.dataset.role = "param-computed";
    const syncComputedVisibility = () => {
        const hidden = readControl(type) !== "computed";
        computed.toggleAttribute("hidden", hidden);
        computed.style.display = hidden ? "none" : "";
    };
    computed.addEventListener("change", onChange);
    syncComputedVisibility();

    const remove = makeIconButton(ICON_X, {
        ariaLabel: "Remove param",
        onClick: () => {
            row.remove();
            onChange();
        },
    });

    row.append(name, type, computed, req, remove);
    return row;
}

/** Read one row into a `QueryParam`, or `null` when the name is blank (unfilled). */
export function readQueryParamRow(row: HTMLElement): QueryParam | null {
    const name = readControl(row.querySelector('[data-role="param-name"]')!).trim();
    if (!name) {
        return null;
    }
    const rawType = readControl(row.querySelector('[data-role="param-type"]')!);
    const type = rawType === "computed" ? "string" : rawType;
    const required = row.querySelector('[data-role="required"]')!.hasAttribute("checked");
    const description = row.dataset.description;
    const source = rawType === "computed" ? readComputedSource(row) : {};
    return { name, in: "query", type, required, ...(description ? { description } : {}), ...source };
}

function readComputedSource(row: HTMLElement): { source?: ParamValueSource } {
    const ref = readControl(row.querySelector('[data-role="param-computed"]')!);
    return {
        source: {
            from: "computed",
            ref: (COMPUTED_PARAM_REFS as readonly string[]).includes(ref) ? (ref as ComputedParamRef) : "userID",
        },
    };
}
