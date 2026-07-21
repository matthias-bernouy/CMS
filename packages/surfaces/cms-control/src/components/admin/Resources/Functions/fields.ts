import { fetchSourceEndpoint, type FunctionDetail, type FunctionExecuteField } from "./api";
import {
    arrayAt,
    cssEscape,
    labelFromPath,
    resolvedParams,
    setDraftValue,
    setPathValue,
    stringValue,
    stringify,
    valueAt,
    valueAtDraft,
} from "./draft";
import { div, fieldWrap, helper, option, textarea } from "./dom";
import type { FunctionDraft } from "./types";

type OnChange = (path?: string) => void;

export function executeFields(detail: FunctionDetail, draft: FunctionDraft, onChange: OnChange): HTMLElement {
    const fields = detail.ui?.execute?.fields ?? [];
    if (!fields.length) {
        return fallbackJsonFields(detail);
    }
    return div("fields-stack", ...fields.map((field) => executeField(field, draft, onChange)));
}

export async function hydrateExecuteFields(
    root: ParentNode,
    detail: FunctionDetail,
    draft: FunctionDraft,
): Promise<void> {
    for (const field of detail.ui?.execute?.fields ?? []) {
        if (field.control === "source-select") {
            await hydrateSourceSelect(root, field, draft);
        }
    }
}

export async function seedDependents(
    root: ParentNode,
    detail: FunctionDetail,
    path: string,
    draft: FunctionDraft,
): Promise<void> {
    for (const field of detail.ui?.execute?.fields ?? []) {
        if (field.control !== "json-object" || field.seed?.dependsOn !== path) {
            continue;
        }
        const input = root.querySelector<HTMLTextAreaElement>(`textarea[data-path="${cssEscape(field.path)}"]`);
        if (!input || !field.seed) {
            continue;
        }
        const seed = await seedObject(field.seed, draft).catch(() => null);
        if (seed === null) {
            continue;
        }
        setDraftValue(draft, field.path, seed);
        input.value = stringify(seed);
    }
}

function executeField(field: FunctionExecuteField, draft: FunctionDraft, onChange: OnChange): HTMLElement {
    if (field.control === "source-select") {
        return sourceSelectField(field, draft, onChange);
    }
    if (field.control === "json-object") {
        return jsonObjectField(field, draft, onChange);
    }
    return textField(field, draft, onChange);
}

function sourceSelectField(
    field: Extract<FunctionExecuteField, { control: "source-select" }>,
    draft: FunctionDraft,
    onChange: OnChange,
): HTMLElement {
    const select = document.createElement("select");
    select.dataset.path = field.path;
    select.append(option("", "Loading..."));
    select.value = String(valueAtDraft(draft, field.path) ?? "");
    select.addEventListener("change", () => {
        setDraftValue(draft, field.path, select.value);
        onChange(field.path);
    });
    return fieldWrap(field.label ?? labelFromPath(field.path), select, helper("Choose a configured source value."));
}

function jsonObjectField(
    field: Extract<FunctionExecuteField, { control: "json-object" }>,
    draft: FunctionDraft,
    onChange: OnChange,
): HTMLElement {
    const input = textarea("json-field", stringify(valueAtDraft(draft, field.path) ?? {}));
    input.dataset.path = field.path;
    input.addEventListener("input", () => onChange());
    const hint = field.seed ? "Seeded from the selected value when available." : "Edit a JSON object.";
    return fieldWrap(field.label ?? labelFromPath(field.path), input, helper(hint));
}

function textField(
    field: Extract<FunctionExecuteField, { control: "text" }>,
    draft: FunctionDraft,
    onChange: OnChange,
): HTMLElement {
    const input = document.createElement("input");
    input.type = "text";
    input.dataset.path = field.path;
    input.value = String(valueAtDraft(draft, field.path) ?? "");
    input.addEventListener("input", () => {
        setDraftValue(draft, field.path, input.value);
        onChange(field.path);
    });
    return fieldWrap(field.label ?? labelFromPath(field.path), input);
}

async function hydrateSourceSelect(
    root: ParentNode,
    field: Extract<FunctionExecuteField, { control: "source-select" }>,
    draft: FunctionDraft,
): Promise<void> {
    const select = root.querySelector<HTMLSelectElement>(`select[data-path="${cssEscape(field.path)}"]`);
    if (!select) {
        return;
    }
    try {
        const response = await fetchSourceEndpoint(field.source, field.endpoint, resolvedParams(field.params, draft));
        const items = arrayAt(response, field.itemsPath ?? "items");
        select.replaceChildren(option("", "Select..."));
        for (const item of items) {
            const value = stringValue(valueAt(item, field.valuePath ?? "id"));
            if (!value) {
                continue;
            }
            const label = stringValue(valueAt(item, field.labelPath ?? field.valuePath ?? "id")) || value;
            select.append(option(value, label));
        }
        select.value = String(valueAtDraft(draft, field.path) ?? "");
    } catch (error) {
        select.replaceChildren(option("", error instanceof Error ? error.message : "Failed to load options"));
    }
}

async function seedObject(
    seed: NonNullable<Extract<FunctionExecuteField, { control: "json-object" }>["seed"]>,
    draft: FunctionDraft,
): Promise<Record<string, unknown>> {
    const response = await fetchSourceEndpoint(seed.source, seed.endpoint, resolvedParams(seed.params, draft));
    const out: Record<string, unknown> = {};
    for (const token of arrayAt(response, seed.pathsPath)) {
        const path = typeof token === "string" ? token : stringValue(valueAt(token, seed.pathNamePath ?? "name"));
        if (!path) {
            continue;
        }
        const sample = typeof token === "string" ? "" : (valueAt(token, seed.samplePath ?? "sample") ?? "");
        setPathValue(out, path, sample);
    }
    return out;
}

function fallbackJsonFields(detail: FunctionDetail): HTMLElement {
    const fields = [fieldWrap("Params JSON", textarea("params", stringify(detail.paramsSample)))];
    if (detail.body) {
        fields.push(fieldWrap("Body JSON", textarea("body", stringify(detail.bodySample ?? {}))));
    }
    return div("fields-stack", ...fields);
}
