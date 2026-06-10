import type { EndpointResponse, DataShape, EndpointHeader } from "@bernouy/cms-gateway";
import { isValidHeaderName, isForbiddenHeaderName } from "@bernouy/cms-gateway";
import { parseDataShape } from "./parseDataShape";
import { str } from "./gatewayValidators";

/**
 * Lenient per-endpoint JSON-blob parsers (`output`, `headers`). Unlike the
 * param/meta validators they NEVER throw: a malformed stored blob is dropped to
 * `undefined` so an editor-less round-trip field can't make the provider
 * un-saveable. The editor (or a future tab) is what surfaces validation to the user.
 */

/** An HTTP status code "100".."599", or the OpenAPI fallback literal "default". */
const STATUS_CODE = /^[1-5][0-9][0-9]$/;
/** Parse a per-endpoint `output` JSON blob into a per-status `EndpointResponse[]`, or
 *  `undefined` when nothing valid remains. Bad entries dropped, status must be a code
 *  or "default", duplicates keep the FIRST; a body failing `parseDataShape`
 *  (proto/depth/node-count defenses) is dropped while the status entry is kept. */
export function parseResponsesBlob(raw: string | undefined, path: string): EndpointResponse[] | undefined {
    if (raw == null || raw === "") return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return undefined; }
    if (!Array.isArray(parsed)) return undefined;
    const out: EndpointResponse[] = [];
    const seen = new Set<string>();
    parsed.forEach((el, i) => {
        if (typeof el !== "object" || el === null || Array.isArray(el)) return;
        const e = el as Record<string, unknown>;
        const status = typeof e.status === "string" ? e.status : "";
        if ((status !== "default" && !STATUS_CODE.test(status)) || seen.has(status)) return;
        seen.add(status);   // dedupe: keep first
        let body: DataShape | undefined;
        if (e.body != null) try { body = parseDataShape(e.body, `${path}[${i}].body`); } catch { /* bad body dropped */ }
        out.push(body ? { status, body } : { status });
    });
    return out.length ? out : undefined;
}

/** Max stored request headers per endpoint — a defensive cap (the editor never
 *  authors near it), mirroring `parseDataShape`'s bounding intent. */
const MAX_HEADERS = 50;
/** A control char other than HTAB (0x09) in a header value — CR/LF/NUL etc. would
 *  make the executor's `Headers.set` throw at request time, so we reject at parse. */
function hasControlChar(v: string): boolean {
    for (let i = 0; i < v.length; i++) {
        const c = v.charCodeAt(i);
        if ((c < 0x20 && c !== 0x09) || c === 0x7f) return true;
    }
    return false;
}
/** Parse a per-endpoint `headers` JSON blob into `EndpointHeader[]`, or `undefined`
 *  when nothing valid remains. A name must be a non-empty RFC token (`isValidHeaderName`)
 *  and NOT forbidden/hop-by-hop (`isForbiddenHeaderName`) — so stored config matches
 *  what the executor forwards. `static` values reject control chars and cap at 8192;
 *  `secret` needs a non-empty `ref`. DEDUPE by name case-insensitive (keep first); cap MAX_HEADERS. */
export function parseHeadersBlob(raw: unknown, _path: string): EndpointHeader[] | undefined {
    if (raw == null || raw === "" || typeof raw !== "string") return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return undefined; }
    if (!Array.isArray(parsed)) return undefined;
    const out: EndpointHeader[] = [];
    const seen = new Set<string>();
    for (const el of parsed) {
        if (out.length >= MAX_HEADERS) break;
        if (typeof el !== "object" || el === null || Array.isArray(el)) continue;
        const e = el as Record<string, unknown>;
        const name = typeof e.name === "string" ? e.name : "";
        if (!name || !isValidHeaderName(name) || isForbiddenHeaderName(name)) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        const source = parseHeaderSource(e.source);
        if (!source) continue;
        seen.add(key);
        out.push({ name, source });
    }
    return out.length ? out : undefined;
}

/** A header value source: `{from:'static',value}` (no control chars, <= 8192) or `{from:'secret',ref}` (non-empty). */
function parseHeaderSource(raw: unknown): EndpointHeader["source"] | undefined {
    if (typeof raw !== "object" || raw === null) return undefined;
    const s = raw as Record<string, unknown>;
    if (s.from === "static") {
        const value = typeof s.value === "string" ? s.value : undefined;
        if (value === undefined || hasControlChar(value) || value.length > 8192) return undefined;
        return { from: "static", value };
    }
    if (s.from === "secret") {
        const ref = str(s.ref);
        return ref ? { from: "secret", ref } : undefined;
    }
    return undefined;
}
