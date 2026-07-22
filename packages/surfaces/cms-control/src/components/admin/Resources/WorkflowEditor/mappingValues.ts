import type { FunctionValue } from "@bernouy/cms-functions";

import type { ValueDraft } from "./mappingTypes";

export function mappedObject(draft: Record<string, ValueDraft>): Record<string, FunctionValue> {
    const result: Record<string, FunctionValue> = {};
    for (const [path, value] of Object.entries(draft)) {
        if (!value.value) {
            continue;
        }
        setPath(result, path, resolvedDraftValue(value));
    }
    return result;
}

export function resolvedDraftValue(draft: ValueDraft): FunctionValue {
    if (draft.mode === "reference") {
        return draft.value;
    }
    const raw = draft.value.trim();
    if (!raw) {
        return "";
    }
    try {
        return JSON.parse(raw) as FunctionValue;
    } catch {
        return raw;
    }
}

function setPath(target: Record<string, FunctionValue>, path: string, value: FunctionValue): void {
    if (!path) {
        target.value = value;
        return;
    }
    const parts = path.split(".").filter(Boolean);
    let current = target;
    for (const [index, part] of parts.entries()) {
        if (index === parts.length - 1) {
            current[part] = value;
            return;
        }
        const existing = current[part];
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
            current[part] = {};
        }
        current = current[part] as Record<string, FunctionValue>;
    }
}
