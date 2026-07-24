import { isCmsQueryParamName } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../../../runtime";
import type { DataSourcePickerSourceBinding, DataSourcePickerSourceParamValue } from "./dataSourceBinding";

const QUERY_PARAM_ERROR =
    "Start with a letter, number, or underscore; then use letters, numbers, underscores, dots, dashes, or colons.";

export function readSourceBinding(root: ParentNode, source: EditorDataSource): DataSourcePickerSourceBinding | null {
    const alias = root.querySelector<HTMLInputElement>(".source-alias")?.value.trim();
    const trigger = selectedTrigger(root.querySelector<HTMLSelectElement>(".source-trigger"));
    const method = source.method ?? "GET";
    const params = readRows(root, "param");
    const body = readRows(root, "body");
    if (!params || !body) {
        return null;
    }

    return {
        url: source.url,
        ...(alias ? { alias } : {}),
        ...(method !== "GET" || trigger !== "auto" ? { method } : {}),
        ...(trigger !== "auto" ? { trigger } : {}),
        ...(Object.keys(params).length ? { params } : {}),
        ...(Object.keys(body).length ? { body } : {}),
    };
}

function readRows(root: ParentNode, kind: "param" | "body"): Record<string, DataSourcePickerSourceParamValue> | null {
    const params: Record<string, DataSourcePickerSourceParamValue> = {};
    let valid = true;

    for (const row of Array.from(root.querySelectorAll(`.param-row[data-binding-kind="${kind}"]`)) as HTMLElement[]) {
        const name = row.dataset.paramName;
        const modeElement = row.querySelector(".param-mode") as HTMLSelectElement | null;
        const mode = modeElement ? selectedMode(modeElement) : "queryParam";
        const input = row.querySelector(".param-value") as HTMLInputElement | null;
        const rawValue = input?.value.trim();
        setQueryParamValidity(input, true);
        if (!name || !rawValue) {
            continue;
        }
        if (kind === "param" && mode === "queryParam" && !isCmsQueryParamName(rawValue)) {
            setQueryParamValidity(input, false);
            valid = false;
            continue;
        }

        if (mode === "raw") {
            params[name] = { from: "raw", value: rawValue };
        } else {
            params[name] = { from: mode, name: rawValue };
        }
    }

    return valid ? params : null;
}

function setQueryParamValidity(input: HTMLInputElement | null, valid: boolean): void {
    if (!input) {
        return;
    }
    if (valid) {
        input.removeAttribute("aria-invalid");
    } else {
        input.setAttribute("aria-invalid", "true");
    }
    input.setCustomValidity?.(valid ? "" : QUERY_PARAM_ERROR);
    if (!valid) {
        input.focus();
        input.reportValidity?.();
    }
}

function selectedMode(select: HTMLSelectElement): DataSourcePickerSourceParamValue["from"] {
    const value = select.options[select.selectedIndex]?.value;
    return value === "raw" || value === "state" ? value : "queryParam";
}

function selectedTrigger(select: HTMLSelectElement | null): "auto" | "submit" | "change" {
    const value = select?.options[select.selectedIndex]?.value;
    return value === "submit" || value === "change" ? value : "auto";
}
