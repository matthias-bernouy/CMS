import { parseSyncTarget } from "cms-content/blocs/core/markup/bindings";

const TYPED_PATH = /^[A-Za-z0-9_-]+(?:\[[A-Za-z0-9_-]+\])*$/;

export function isTypedSourceBody(value: string): boolean {
    return isTypedParameterMap(value, (name) => Boolean(name.trim()));
}

export function isTypedQueryInput(value: string): boolean {
    return isTypedParameterMap(value, (name) => TYPED_PATH.test(name));
}

function isTypedParameterMap(value: string, validName: (name: string) => boolean): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return false;
    }
    return (
        isRecord(parsed) &&
        Object.keys(parsed).length > 0 &&
        Object.entries(parsed).every(([name, source]) => validName(name) && isTypedSourceParam(source))
    );
}

function isTypedSourceParam(value: unknown): boolean {
    if (!isRecord(value) || typeof value.from !== "string") {
        return false;
    }
    const keys = Object.keys(value).sort().join(",");
    if (value.from === "sync") {
        return keys === "from,key" && typeof value.key === "string" && parseSyncTarget(value.key) !== null;
    }
    if (value.from !== "raw" || keys !== "from,value") {
        return false;
    }
    return (
        (typeof value.value === "string" && Boolean(value.value.trim())) ||
        (typeof value.value === "number" && Number.isFinite(value.value)) ||
        typeof value.value === "boolean"
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
