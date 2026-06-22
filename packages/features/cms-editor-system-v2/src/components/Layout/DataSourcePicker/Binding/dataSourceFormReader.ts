import type { EditorDataSource } from "../../../../runtime";
import type {
    DataSourcePickerSourceBinding,
    DataSourcePickerSourceParamValue,
} from "./dataSourceBinding";

export function readSourceBinding(root: ParentNode, source: EditorDataSource): DataSourcePickerSourceBinding {
    const alias = root.querySelector<HTMLInputElement>(".source-alias")?.value.trim();
    const params = readParams(root);

    return {
        url: source.url,
        ...(alias ? { alias } : {}),
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

        params[name] = mode === "raw"
            ? { from: "raw", value: rawValue }
            : { from: "queryParam", name: rawValue };
    }

    return params;
}

function selectedMode(select: HTMLSelectElement): DataSourcePickerSourceParamValue["from"] {
    return select.options[select.selectedIndex]?.value === "raw" ? "raw" : "queryParam";
}
