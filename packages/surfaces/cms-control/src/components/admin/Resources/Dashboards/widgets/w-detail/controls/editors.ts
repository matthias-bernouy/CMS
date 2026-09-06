import "@bernouy/cms-editor-system-v2/page-link";
import "cms-control/components/admin/Common/CredentialSelect/CredentialSelect";
import type { WDetailTableColumn } from "../types";
import {
    applyRemoteLookupMetadata,
    isTokenControl,
    isValueControl,
    optionElement,
    type TokenControl,
    type ValueControl,
} from "./shared";

export function createTableEditor(column: WDetailTableColumn, value: unknown): HTMLElement {
    if (column.editable !== true) {
        throw new Error("Cannot create an editor for a readonly column");
    }
    const control =
        column.type === "select"
            ? selectEditor(column, value)
            : column.type === "combobox"
              ? comboboxEditor(column, value)
              : column.type === "tokens"
                ? tokensEditor(value)
                : textEditor(value);
    control.dataset.tableColumn = column.key;
    control.setAttribute("aria-label", column.label);
    return control;
}

export function readTableEditor(column: WDetailTableColumn, control: HTMLElement): unknown {
    if (column.editable !== true) {
        return undefined;
    }
    if (column.type === "tokens") {
        return isTokenControl(control) ? [...control.values] : [];
    }
    return isValueControl(control) ? control.value : "";
}

function textEditor(value: unknown): ValueControl {
    const input = document.createElement("p9r-input") as ValueControl;
    const text = textValue(value);
    input.setAttribute("value", text);
    input.value = text;
    return input;
}

function selectEditor(column: Extract<WDetailTableColumn, { type: "select" }>, value: unknown): ValueControl {
    const input = document.createElement("p9r-select") as ValueControl;
    const text = textValue(value);
    input.setAttribute("value", text);
    input.replaceChildren(...column.options.map((option) => optionElement(option, text)));
    return input;
}

function comboboxEditor(column: Extract<WDetailTableColumn, { type: "combobox" }>, value: unknown): ValueControl {
    const input = document.createElement("p9r-combobox") as ValueControl;
    const text = textValue(value);
    input.setAttribute("value", text);
    input.replaceChildren(...column.options.map((option) => optionElement(option, text)));
    applyRemoteLookupMetadata(input, column);
    input.value = text;
    return input;
}

function tokensEditor(value: unknown): TokenControl {
    const input = document.createElement("p9r-token-input") as TokenControl;
    const values = Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
    input.setAttribute("value", values.join(","));
    input.setAttribute("creatable", "");
    return input;
}

function textValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}

export function createReferenceEditor(
    field: {
        type: "secret-ref" | "page-link";
        label: string;
        publishedOnly?: boolean;
        allowExternal?: boolean;
        allowMedia?: boolean;
    },
    value: unknown,
): ValueControl {
    const control = document.createElement(
        field.type === "secret-ref" ? "cms-credential-select" : "cms-editor-v2-page-link",
    ) as ValueControl;
    control.setAttribute("label", field.label);
    control.setAttribute("value", textValue(value));
    if (field.type === "page-link") {
        control.setAttribute("allow-external", String(field.allowExternal === true));
        control.setAttribute("allow-media", String(field.allowMedia === true));
        control.setAttribute("published-only", String(field.publishedOnly === true));
        control.addEventListener("input", () =>
            control.dispatchEvent(new Event("change", { bubbles: true, composed: true })),
        );
    } else {
        const base = document.querySelector<HTMLMetaElement>('meta[name="basePath"]')?.content ?? "";
        control.setAttribute("api", `${base}/api/secrets`);
    }
    return control;
}
