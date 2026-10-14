import type {
    CmsMutationBinding,
    CmsQueriesBinding,
    CmsQueryBinding,
    CmsQueryInput,
    CmsQueryListen,
    CmsQueryRefreshPolicy,
} from "cms-content/blocs/core/markup/bindings/types";
import { asSyncTarget, parseSyncTarget } from "cms-content/blocs/core/markup/bindings/sync";
import { asBindingInput, parseBindingInput } from "./input";

const QUERY_PATTERN =
    /^\s*([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*):([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/u;
const SYNC_QUERY_PATTERN = /^\s*(@(?:param|page|session|persistent):[^\s]+)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/u;
const QUERY_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const QUERY_REFRESH_INTERVAL = /^interval\((\d+)(ms|s|m)\)$/u;
const MAX_QUERY_IMPORTS = 16;
const MAX_QUERY_LISTEN_TARGETS = 16;
const MIN_QUERY_REFRESH_INTERVAL_MS = 1_000;
const MAX_QUERY_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;
const RESERVED_QUERY_NAMES = new Set(["cms"]);

export function parseMutation(value: string): CmsMutationBinding | null {
    const match = QUERY_PATTERN.exec(value);
    if (!match || RESERVED_QUERY_NAMES.has(match[3]!)) {
        return null;
    }
    return { contractId: match[1]!, capabilityId: match[2]!, name: match[3]! };
}

export function asMutation(mutation: CmsMutationBinding): string {
    const value = `${mutation.contractId}:${mutation.capabilityId} as ${mutation.name}`;
    if (!parseMutation(value)) {
        throw new TypeError("Invalid CMS mutation binding");
    }
    return value;
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

export function asQueries(queries: CmsQueriesBinding): string {
    const value = queries.map((query) => `${asSyncTarget(query.sync)} as ${query.name}`).join(" ");
    if (!parseQueries(value)) {
        throw new TypeError("Invalid CMS query imports");
    }
    return value;
}

export function parseQueries(value: string | null | undefined): CmsQueriesBinding | null {
    const tokens = value?.trim().split(/\s+/u).filter(Boolean) ?? [];
    if (tokens.length === 0 || tokens.length % 3 !== 0 || tokens.length / 3 > MAX_QUERY_IMPORTS) {
        return null;
    }
    const queries = [];
    const targets = new Set<string>();
    const names = new Set<string>();
    for (let index = 0; index < tokens.length; index += 3) {
        const targetValue = tokens[index]!;
        const target = parseSyncTarget(targetValue);
        const name = tokens[index + 2]!;
        if (
            !target ||
            tokens[index + 1] !== "as" ||
            !QUERY_NAME_PATTERN.test(name) ||
            RESERVED_QUERY_NAMES.has(name) ||
            targets.has(targetValue) ||
            names.has(name)
        ) {
            return null;
        }
        targets.add(targetValue);
        names.add(name);
        queries.push({ sync: target, name });
    }
    return queries;
}

export function asQueryInput(input: CmsQueryInput): string {
    return asBindingInput(input);
}

export function parseQueryInput(value: string | null | undefined): CmsQueryInput | null {
    return parseBindingInput(value);
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
