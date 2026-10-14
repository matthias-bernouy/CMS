import type {
    CmsQueryBinding,
    CmsQueryInput,
    CmsQueryListen,
    CmsQueryRefreshPolicy,
    CmsSourceBinding,
    CmsSourceUrl,
} from "cms-content/blocs/core/markup/bindings/types";
import { asSyncTarget, parseSyncTarget } from "cms-content/blocs/core/markup/bindings/sync";
import { asSourceBody, parseSourceBody } from "./input";

export { asSourceBody, parseSourceBody } from "./input";

const INTERPOLATION_PATTERN = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const INTERPOLATION_TOKEN_PATTERN = /\{\{\s*([\s\S]*?)\s*\}\}/gu;
const SOURCE_ALIAS_PATTERN = /^\s*([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
const QUERY_PATTERN =
    /^\s*([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*):([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/u;
const SYNC_QUERY_PATTERN = /^\s*(@(?:param|page|session|persistent):[^\s]+)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/u;
const QUERY_REFRESH_INTERVAL = /^interval\((\d+)(ms|s|m)\)$/u;
const MAX_QUERY_LISTEN_TARGETS = 16;
const MIN_QUERY_REFRESH_INTERVAL_MS = 1_000;
const MAX_QUERY_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;
const RESERVED_QUERY_NAMES = new Set(["cms"]);

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

/** Returns every token expression, or null for unmatched/empty delimiters. */
export function interpolationExpressions(value: string): readonly string[] | null {
    const expressions: string[] = [];
    let cursor = 0;
    for (const match of value.matchAll(INTERPOLATION_TOKEN_PATTERN)) {
        const expression = match[1]?.trim() ?? "";
        const start = match.index ?? 0;
        if (!expression || /\{\{|\}\}/u.test(value.slice(cursor, start))) {
            return null;
        }
        expressions.push(expression);
        cursor = start + match[0].length;
    }
    return expressions.length > 0 && !/\{\{|\}\}/u.test(value.slice(cursor)) ? expressions : null;
}

export function asSource(source: CmsSourceUrl | CmsSourceBinding): string {
    if (typeof source === "string") {
        return source.trim();
    }
    const url = source.url.trim();
    const alias = source.alias?.trim();
    return alias ? `${url} as ${alias}` : url;
}

export function parseSource(value: string): CmsSourceBinding | null {
    const match = SOURCE_ALIAS_PATTERN.exec(value);
    if (match) {
        const url = match[1]!.trim();
        const alias = match[2]!;
        return url && !RESERVED_QUERY_NAMES.has(alias) ? { url, alias } : null;
    }
    const url = value.trim();
    return url ? { url } : null;
}

export function asQuery(query: CmsQueryBinding): string {
    const value =
        "sync" in query
            ? `${asSyncTarget(query.sync)} as ${query.name}`
            : `${query.contractId}:${query.capabilityId} as ${query.name}`;
    if (!parseQuery(value)) {
        throw new TypeError("Invalid CMS query binding");
    }
    return value;
}

export function parseQuery(value: string): CmsQueryBinding | null {
    const syncMatch = SYNC_QUERY_PATTERN.exec(value);
    if (syncMatch) {
        const sync = parseSyncTarget(syncMatch[1]);
        return sync && !RESERVED_QUERY_NAMES.has(syncMatch[2]!) ? { sync, name: syncMatch[2]! } : null;
    }
    const match = QUERY_PATTERN.exec(value);
    if (!match || RESERVED_QUERY_NAMES.has(match[3]!)) {
        return null;
    }
    return { contractId: match[1]!, capabilityId: match[2]!, name: match[3]! };
}

export function asQueryInput(input: CmsQueryInput): string {
    return asSourceBody(input);
}

export function parseQueryInput(value: string | null | undefined): CmsQueryInput | null {
    return parseSourceBody(value);
}

export function asQueryListen(listeners: CmsQueryListen): string {
    const value = listeners.map(asSyncTarget).join(" ");
    if (!parseQueryListen(value)) {
        throw new TypeError("Invalid CMS query listeners");
    }
    return value;
}

export function parseQueryListen(value: string | null | undefined): CmsQueryListen | null {
    const tokens = value?.trim().split(/\s+/u).filter(Boolean) ?? [];
    if (tokens.length === 0 || tokens.length > MAX_QUERY_LISTEN_TARGETS || new Set(tokens).size !== tokens.length) {
        return null;
    }
    const listeners = tokens.map(parseSyncTarget);
    return listeners.every((listener) => listener !== null) ? listeners : null;
}

export function parseQueryRefresh(value: string | null | undefined): CmsQueryRefreshPolicy | null {
    const tokens = value?.trim().split(/\s+/u).filter(Boolean) ?? [];
    if (tokens.length === 0 || new Set(tokens).size !== tokens.length) {
        return null;
    }
    let intervalMs: number | undefined;
    let focus = false;
    let reconnect = false;
    for (const token of tokens) {
        if (token === "focus") {
            focus = true;
            continue;
        }
        if (token === "reconnect") {
            reconnect = true;
            continue;
        }
        const interval = QUERY_REFRESH_INTERVAL.exec(token);
        if (!interval || intervalMs !== undefined) {
            return null;
        }
        const amount = Number(interval[1]);
        const multiplier = interval[2] === "m" ? 60_000 : interval[2] === "s" ? 1_000 : 1;
        intervalMs = amount * multiplier;
        if (
            !Number.isSafeInteger(intervalMs) ||
            intervalMs < MIN_QUERY_REFRESH_INTERVAL_MS ||
            intervalMs > MAX_QUERY_REFRESH_INTERVAL_MS
        ) {
            return null;
        }
    }
    return { ...(intervalMs === undefined ? {} : { intervalMs }), focus, reconnect };
}
