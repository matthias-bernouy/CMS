import type { FunctionValue } from "@bernouy/cms-functions";

import {
    mappedObject,
    resolvedDraftValue,
    type MappingShape,
    type ReferenceOption,
    type ValueDraft,
} from "../../WorkflowEditor/mapping";

export function input(root: ParentNode, name: string): HTMLInputElement {
    return root.querySelector(`[data-field="${name}"]`) as HTMLInputElement;
}

export function textarea(root: ParentNode, name: string): HTMLTextAreaElement {
    return root.querySelector(`[data-field="${name}"]`) as HTMLTextAreaElement;
}

export function select(root: ParentNode, name: string): HTMLSelectElement {
    return root.querySelector(`[data-field="${name}"]`) as HTMLSelectElement;
}

export function checkbox(root: ParentNode, name: string): HTMLInputElement {
    return input(root, name);
}

export function option(value: string, label: string): HTMLOptionElement {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    return element;
}

export function parseOptionalObject(raw: string, label: string): Record<string, FunctionValue> | undefined {
    if (!raw.trim()) {
        return undefined;
    }
    try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error();
        }
        return value as Record<string, FunctionValue>;
    } catch {
        throw new Error(`${label} must be a JSON object.`);
    }
}

export function mappedDraft(draft: Record<string, ValueDraft>): FunctionValue | undefined {
    const root = draft[""];
    if (root?.value) {
        return resolvedDraftValue(root);
    }
    const mapped = mappedObject(draft);
    return Object.keys(mapped).length ? mapped : undefined;
}

export function parseOptionalValue(raw: string): FunctionValue | undefined {
    if (!raw.trim()) {
        return undefined;
    }
    const text = raw.trim();
    if (text.startsWith("$")) {
        return text;
    }
    try {
        return JSON.parse(text) as FunctionValue;
    } catch {
        return text;
    }
}

export function identifier(value: string): string {
    const words =
        value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .match(/[A-Za-z0-9]+/g) ?? [];
    return words.map((word) => word.toLowerCase()).join("-");
}

export function dataShapeType(value: string | undefined): MappingShape["type"] {
    return value === "number" || value === "boolean" || value === "object" || value === "array" ? value : "string";
}

export function uniqueReferences(references: ReferenceOption[]): ReferenceOption[] {
    const seen = new Set<string>();
    return references.filter((reference) => {
        if (seen.has(reference.value)) {
            return false;
        }
        seen.add(reference.value);
        return true;
    });
}
