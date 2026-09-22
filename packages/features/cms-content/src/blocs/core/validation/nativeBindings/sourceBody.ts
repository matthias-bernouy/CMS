import { isCmsQueryParamName } from "cms-content/editor/core/bindings";

const PAGE_STATE_KEY = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;

export function isTypedSourceBody(value: string): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return false;
    }
    return (
        isRecord(parsed) &&
        Object.keys(parsed).length > 0 &&
        Object.entries(parsed).every(([name, source]) => Boolean(name.trim()) && isTypedSourceParam(source))
    );
}

function isTypedSourceParam(value: unknown): boolean {
    if (!isRecord(value) || typeof value.from !== "string") {
        return false;
    }
    const keys = Object.keys(value).sort().join(",");
    if (value.from === "queryParam") {
        return keys === "from,name" && isCmsQueryParamName(value.name as string | undefined);
    }
    if (value.from === "state") {
        return keys === "from,name" && typeof value.name === "string" && PAGE_STATE_KEY.test(value.name);
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
