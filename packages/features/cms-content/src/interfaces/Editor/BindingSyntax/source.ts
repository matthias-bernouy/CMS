import type {
    CmsRepeatBinding,
    CmsSourceBinding,
    CmsSourceBodyBinding,
    CmsSourceParamMap,
    CmsSourceParamValue,
    CmsSourceUrl,
} from "./types";

const INTERPOLATION_PATTERN = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const SOURCE_ALIAS_PATTERN = /^\s*([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
const REPEAT_ALIAS_PATTERN = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;

export function asInterpolation(expression: string): string {
    return `{{ ${expression.trim()} }}`;
}

export function parseInterpolation(value: string): string | null {
    const match = INTERPOLATION_PATTERN.exec(value);
    const expression = match?.[1]?.trim();
    return expression || null;
}

export function isInterpolation(value: string): boolean {
    return parseInterpolation(value) !== null;
}

export function asSource(source: CmsSourceUrl | CmsSourceBinding): string {
    if (typeof source === "string") {
        return source.trim();
    }
    const url = sourceUrlWithParams(source.url, source.params);
    const alias = source.alias?.trim();
    return alias ? `${url} as ${alias}` : url;
}

export function parseSource(value: string): CmsSourceBinding | null {
    const match = SOURCE_ALIAS_PATTERN.exec(value);
    if (match) {
        const url = match[1]!.trim();
        return url ? { url, alias: match[2]! } : null;
    }
    const url = value.trim();
    return url ? { url } : null;
}

export function asSourceBody(body: CmsSourceBodyBinding): string {
    const normalized = normalizeSourceParamMap(body);
    return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
}

export function parseSourceBody(value: string | null | undefined): CmsSourceBodyBinding | null {
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
    const body: CmsSourceBodyBinding = {};
    for (const [name, source] of Object.entries(parsed)) {
        const param = normalizeSourceParamValue(source);
        if (name.trim() && param) {
            body[name] = param;
        }
    }
    return Object.keys(body).length ? body : null;
}

export function asRepeat(binding: CmsRepeatBinding): string {
    const path = binding.path.trim();
    const alias = binding.alias?.trim();
    return alias ? `${path} as ${alias}` : path;
}

export function parseRepeat(value: string): CmsRepeatBinding | null {
    const match = REPEAT_ALIAS_PATTERN.exec(value);
    if (match) {
        return { path: match[1]!.trim(), alias: match[2]! };
    }
    const path = value.trim();
    return path ? { path } : null;
}

function sourceUrlWithParams(rawUrl: string, params?: CmsSourceParamMap): string {
    const url = rawUrl.trim();
    if (!params) {
        return url;
    }
    const entries = Object.entries(normalizeSourceParamMap(params));
    if (entries.length === 0) {
        return url;
    }
    const hashIndex = url.indexOf("#");
    const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
    const separator = beforeHash.endsWith("?") || beforeHash.endsWith("&") ? "" : beforeHash.includes("?") ? "&" : "?";
    const query = entries
        .map(([name, source]) => `${encodeURIComponent(name)}=${encodeSourceParamValue(source)}`)
        .join("&");
    return `${beforeHash}${separator}${query}${hash}`;
}

function encodeSourceParamValue(value: CmsSourceParamValue): string {
    if (value.from === "queryParam") {
        return `#{${value.name.trim()}}`;
    }
    if (value.from === "state") {
        return `@{${value.name.trim()}}`;
    }
    return encodeURIComponent(String(value.value).trim());
}

function normalizeSourceParamMap(params: CmsSourceParamMap): Record<string, CmsSourceParamValue> {
    const normalized: Record<string, CmsSourceParamValue> = {};
    for (const [name, value] of Object.entries(params)) {
        const param = normalizeSourceParamValue(value);
        if (name.trim() && param) {
            normalized[name] = param;
        }
    }
    return normalized;
}

function normalizeSourceParamValue(value: unknown): CmsSourceParamValue | null {
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
    return typeof value.value === "boolean" ? { from: "raw", value: value.value } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
