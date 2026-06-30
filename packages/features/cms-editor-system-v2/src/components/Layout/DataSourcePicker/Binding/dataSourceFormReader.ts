import type { EditorDataSource } from "../../../../runtime";
import type {
    DataSourcePickerSourceBinding,
    DataSourcePickerSourceParamValue,
} from "./dataSourceBinding";

export function readSourceBinding(root: ParentNode, source: EditorDataSource): DataSourcePickerSourceBinding {
    const alias = root.querySelector<HTMLInputElement>(".source-alias")?.value.trim();
    const trigger = selectedTrigger(root.querySelector<HTMLSelectElement>(".source-trigger"));
    const method = source.method ?? "GET";
    const params = readParams(root);

    return {
        url: source.url,
        ...(alias ? { alias } : {}),
        ...(method !== "GET" || trigger === "submit" ? { method } : {}),
        ...(trigger === "submit" ? { trigger } : {}),
        ...(Object.keys(params).length ? { params } : {}),
    };
}

function readParams(root: ParentNode): Record<string, DataSourcePickerSourceParamValue> {
    const params: Record<string, DataSourcePickerSourceParamValue> = {};

    for (const row of Array.from(root.querySelectorAll(".param-row")) as HTMLElement[]) {
        const name = row.dataset.paramName;
        const modeElement = row.querySelector(".param-mode") as HTMLSelectElement | null;
        const mode = modeElement ? selectedMode(modeElement) : "queryParam";
        const rawValue = (row.querySelector(".param-value") as HTMLInputElement | null)?.value.trim();
        if (!name || !rawValue) continue;

        if (mode === "raw") params[name] = { from: "raw", value: rawValue };
        else params[name] = { from: mode, name: rawValue };
    }

    return params;
}

function selectedMode(select: HTMLSelectElement): DataSourcePickerSourceParamValue["from"] {
    const value = select.options[select.selectedIndex]?.value;
    return value === "raw" || value === "state" ? value : "queryParam";
}

function selectedTrigger(select: HTMLSelectElement | null): "auto" | "submit" {
    const value = select?.options[select.selectedIndex]?.value;
    return value === "submit" ? value : "auto";
}
