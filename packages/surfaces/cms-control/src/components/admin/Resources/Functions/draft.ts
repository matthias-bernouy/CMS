import type { FunctionUiValue } from "./api";
import type { FunctionDraft } from "./types";

export function initialDraft(params: Record<string, unknown>, body: unknown): FunctionDraft {
    return { params: structuredClone(params), body: structuredClone(body ?? {}) };
}

export function readFallbackDraft(root: ParentNode, hasBody: boolean): FunctionDraft {
    return {
        params: parseObject(root.querySelector<HTMLTextAreaElement>("[data-role='params']")?.value ?? "{}", "Params"),
        body: hasBody
            ? parseJson(root.querySelector<HTMLTextAreaElement>("[data-role='body']")?.value ?? "{}", "Body")
            : undefined,
    };
}

export function readPathDraft(root: ParentNode, draft: FunctionDraft): FunctionDraft {
    const next = structuredClone(draft);
    for (const input of Array.from(
        root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-path]"),
    )) {
        const path = input.dataset.path ?? "";
        const value =
            input instanceof HTMLTextAreaElement ? parseObject(input.value || "{}", path || "JSON") : input.value;
        setDraftValue(next, path, value);
    }
    return next;
}

export function resolvedParams(
    params: Record<string, FunctionUiValue> | undefined,
    draft: FunctionDraft,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
        const resolved = resolveUiValue(value, draft);
        if (resolved !== undefined && resolved !== null) {
            out[key] = String(resolved);
        }
    }
    return out;
}

export function valueAtDraft(draft: FunctionDraft, path: string): unknown {
    if (path === "body") {
        return draft.body;
    }
    if (path === "params") {
        return draft.params;
    }
    if (path.startsWith("body.")) {
        return valueAt(draft.body, path.slice("body.".length));
    }
    if (path.startsWith("params.")) {
        return valueAt(draft.params, path.slice("params.".length));
    }
    return undefined;
}

export function setDraftValue(draft: FunctionDraft, path: string, value: unknown): void {
    if (path === "body") {
        draft.body = value;
        return;
    }
    if (path.startsWith("body.")) {
        if (!isRecord(draft.body)) {
            draft.body = {};
        }
        setPathValue(draft.body, path.slice("body.".length), value);
        return;
    }
    if (path.startsWith("params.")) {
        setPathValue(draft.params, path.slice("params.".length), value);
    }
}

export function setPathValue(target: unknown, path: string, value: unknown): void {
    if (!isRecord(target)) {
        return;
    }
    const parts = path.split(".").filter(Boolean);
    let current: Record<string, unknown> = target;
    for (const [index, part] of parts.entries()) {
        if (index === parts.length - 1) {
            current[part] = value;
            return;
        }
        if (!isRecord(current[part])) {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
}

export function valueAt(value: unknown, path: string | undefined): unknown {
    if (!path) {
        return value;
    }
    return path
        .split(".")
        .filter(Boolean)
        .reduce((current, part) => {
            if (current === null || current === undefined) {
                return undefined;
            }
            if (Array.isArray(current) && /^\d+$/.test(part)) {
                return current[Number(part)];
            }
            if (!isRecord(current)) {
                return undefined;
            }
            return current[part];
        }, value);
}

export function arrayAt(value: unknown, path: string): unknown[] {
    const found = valueAt(value, path);
    return Array.isArray(found) ? found : [];
}

export function stringify(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

export function parseObject(value: string, label: string): Record<string, unknown> {
    const parsed = parseJson(value || "{}", label);
    if (!isRecord(parsed)) {
        throw new Error(`${label} must be a JSON object.`);
    }
    return parsed;
}

export function parseJson(value: string, label: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        throw new Error(`${label} is not valid JSON.`);
    }
}

export function stringValue(value: unknown): string {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

export function labelFromPath(path: string): string {
    const last = path.split(".").filter(Boolean).at(-1) ?? path;
    return last.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

export function cssEscape(value: string): string {
    return globalThis.CSS?.escape?.(value) ?? value.replace(/["\\]/g, "\\$&");
}

function resolveUiValue(value: FunctionUiValue, draft: FunctionDraft): unknown {
    if (typeof value === "string" && value.startsWith("$")) {
        return valueAtDraft(draft, value.slice(1));
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
