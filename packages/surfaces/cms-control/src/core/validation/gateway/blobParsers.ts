import type { EndpointResponse, DataShape, EndpointHeader, ComputedParamRef } from "@bernouy/cms-sources";
import {
    isValidHeaderName,
    isForbiddenHeaderName,
    isValidHeaderValue,
    isValidResponseStatus,
    COMPUTED_PARAM_REFS,
    MAX_ENDPOINT_HEADERS,
    parseDataShape,
} from "@bernouy/cms-sources";
import { str } from "./gatewayValidators";

/**
 * Lenient per-endpoint JSON-blob parsers (`output`, `headers`). Unlike the
 * param/meta validators they NEVER throw: a malformed stored blob is dropped to
 * `undefined` so an editor-less round-trip field can't make the provider
 * un-saveable. The editor (or a future tab) is what surfaces validation to the user.
 */

/** Parse a per-endpoint `output` JSON blob into a per-status `EndpointResponse[]`, or
 *  `undefined` when nothing valid remains. Bad entries dropped, status must be a code
 *  or "default" (`isValidResponseStatus`), duplicates keep the FIRST; body shapes
 *  failing `parseDataShape` (proto/depth/node-count defenses) are dropped while the
 *  status entry is kept. */
export function parseResponsesBlob(raw: string | undefined, path: string): EndpointResponse[] | undefined {
    if (raw == null || raw === "") {
        return undefined;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (!Array.isArray(parsed)) {
        return undefined;
    }
    const out: EndpointResponse[] = [];
    const seen = new Set<string>();
    parsed.forEach((el, i) => {
        if (typeof el !== "object" || el === null || Array.isArray(el)) {
            return;
        }
        const e = el as Record<string, unknown>;
        const status = typeof e.status === "string" ? e.status : "";
        if (!isValidResponseStatus(status) || seen.has(status)) {
            return;
        }
        seen.add(status); // dedupe: keep first
        let body: DataShape | undefined;
        if (e.body != null) {
            try {
                body = parseDataShape(e.body, `${path}[${i}].body`);
            } catch {
                /* bad body dropped */
            }
        }
        let triggerBody: DataShape | undefined;
        if (e.triggerBody != null) {
            try {
                triggerBody = parseDataShape(e.triggerBody, `${path}[${i}].triggerBody`);
            } catch {
                /* bad body dropped */
            }
        }
        out.push({ status, ...(body ? { body } : {}), ...(triggerBody ? { triggerBody } : {}) });
    });
    return out.length ? out : undefined;
}

/** Parse a per-endpoint `headers` JSON blob into `EndpointHeader[]`, or `undefined`
 *  when nothing valid remains. A name must be a non-empty RFC token (`isValidHeaderName`)
 *  and NOT forbidden/hop-by-hop (`isForbiddenHeaderName`) — so stored config matches
 *  what the executor forwards. `static` values follow `isValidHeaderValue` (no control
 *  chars, capped length); `secret` needs a non-empty `ref`. DEDUPE by name
 *  case-insensitive (keep first); cap MAX_ENDPOINT_HEADERS. */
export function parseHeadersBlob(raw: unknown, _path: string): EndpointHeader[] | undefined {
    if (raw == null || raw === "" || typeof raw !== "string") {
        return undefined;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (!Array.isArray(parsed)) {
        return undefined;
    }
    const out: EndpointHeader[] = [];
    const seen = new Set<string>();
    for (const el of parsed) {
        if (out.length >= MAX_ENDPOINT_HEADERS) {
            break;
        }
        if (typeof el !== "object" || el === null || Array.isArray(el)) {
            continue;
        }
        const e = el as Record<string, unknown>;
        const name = typeof e.name === "string" ? e.name : "";
        if (!name || !isValidHeaderName(name) || isForbiddenHeaderName(name)) {
            continue;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        const source = parseHeaderSource(e.source);
        if (!source) {
            continue;
        }
        seen.add(key);
        out.push({ name, source });
    }
    return out.length ? out : undefined;
}

/** A header value source: static value, secret ref, or supported computed ref. */
function parseHeaderSource(raw: unknown): EndpointHeader["source"] | undefined {
    if (typeof raw !== "object" || raw === null) {
        return undefined;
    }
    const s = raw as Record<string, unknown>;
    if (s.from === "static") {
        const value = typeof s.value === "string" ? s.value : undefined;
        if (value === undefined || !isValidHeaderValue(value)) {
            return undefined;
        }
        return { from: "static", value };
    }
    if (s.from === "secret") {
        const ref = str(s.ref);
        const prefix = typeof s.prefix === "string" && s.prefix ? s.prefix : undefined;
        if (prefix !== undefined && !isValidHeaderValue(prefix)) {
            return undefined;
        }
        return ref ? { from: "secret", ref, ...(prefix ? { prefix } : {}) } : undefined;
    }
    if (s.from === "computed") {
        const ref = str(s.ref);
        return ref && (COMPUTED_PARAM_REFS as readonly string[]).includes(ref)
            ? { from: "computed", ref: ref as ComputedParamRef }
            : undefined;
    }
    return undefined;
}
