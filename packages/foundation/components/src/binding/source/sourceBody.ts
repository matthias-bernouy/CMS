import { currentParams, currentState } from "../params";
import type { AdditionalFormFields } from "../submit/formSubmit";

type SourceBodyValue =
    | { from: "queryParam"; name: string }
    | { from: "state"; name: string }
    | { from: "raw"; value: string | number | boolean };

type SourceBodyBinding = Record<string, SourceBodyValue>;

export function resolveSourceBodyFields(value: string | null, doc: Document): AdditionalFormFields | undefined {
    const binding = parseSourceBody(value);
    if (!binding) {
        return undefined;
    }

    const fields: AdditionalFormFields = {};
    const params = currentParams();
    for (const [name, source] of Object.entries(binding)) {
        if (source.from === "queryParam") {
            fields[name] = params.get(source.name) ?? "";
        } else if (source.from === "state") {
            fields[name] = currentState(source.name, doc);
        } else {
            fields[name] = source.value;
        }
    }
    return Object.keys(fields).length ? fields : undefined;
}

function parseSourceBody(value: string | null): SourceBodyBinding | null {
    const raw = value?.trim() ?? "";
    if (!raw) {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!isRecord(parsed)) {
        return null;
    }
    const binding: SourceBodyBinding = {};
    for (const [name, source] of Object.entries(parsed)) {
        const normalized = normalizeSourceBodyValue(source);
        if (name.trim() && normalized) {
            binding[name] = normalized;
        }
    }
    return Object.keys(binding).length ? binding : null;
}

function normalizeSourceBodyValue(value: unknown): SourceBodyValue | null {
    if (!isRecord(value) || typeof value.from !== "string") {
        return null;
    }

    if (value.from === "queryParam" || value.from === "state") {
        return typeof value.name === "string" && value.name.trim()
            ? { from: value.from, name: value.name.trim() }
            : null;
    }

    if (value.from !== "raw") {
        return null;
    }
    if (typeof value.value === "string") {
        return value.value.trim() ? { from: "raw", value: value.value } : null;
    }
    if (typeof value.value === "number" && Number.isFinite(value.value)) {
        return { from: "raw", value: value.value };
    }
    if (typeof value.value === "boolean") {
        return { from: "raw", value: value.value };
    }
    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
