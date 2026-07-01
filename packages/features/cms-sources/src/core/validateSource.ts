import type { Source, SourceEndpoint } from "../interfaces/Source";
import { COMPUTED_PARAM_REFS, HTTP_METHODS, PARAM_INS } from "../interfaces/Source";
import { isSourceUrn, isEndpointUrn, sourceUrnOf } from "./urn";
import { isValidHeaderName, isForbiddenHeaderName, isValidHeaderValue, MAX_ENDPOINT_HEADERS } from "./headerPolicy";
import { isSystemSourceUrn } from "./systemSources";

/** `true` if the endpoint urn belongs to the given source. */
export function endpointBelongsToSource(endpointUrn: string, sourceUrn: string): boolean {
    return sourceUrnOf(endpointUrn) === sourceUrn;
}

export function isParsableUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

export type SourceTargetUrlValidationOptions = {
    /** Explicit escape hatch for local/private targets in trusted deployments. */
    allowBlockedTargetHosts?: readonly string[];
};

type TargetUrlVerdict = { ok: true } | { ok: false; reason: string };

export function validateSourceTargetUrl(value: string, opts: SourceTargetUrlValidationOptions = {}): TargetUrlVerdict {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return { ok: false, reason: "invalid URL" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, reason: "targetUrl must use http or https" };
    }

    const hostname = normalizeHostname(url.hostname);
    if (!hostname) return { ok: false, reason: "targetUrl host is required" };
    const allowlist = new Set((opts.allowBlockedTargetHosts ?? []).map(normalizeHostname));
    if (allowlist.has(hostname)) return { ok: true };

    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
        return { ok: false, reason: "targetUrl host is blocked" };
    }

    const ipv4 = parseIpv4(hostname);
    if (ipv4 && isBlockedIpv4(ipv4)) return { ok: false, reason: "targetUrl IP range is blocked" };

    const ipv6 = parseIpv6(hostname);
    if (ipv6 && isBlockedIpv6(ipv6)) return { ok: false, reason: "targetUrl IP range is blocked" };

    return { ok: true };
}

export function isAllowedSourceTargetUrl(value: string, opts?: SourceTargetUrlValidationOptions): boolean {
    return validateSourceTargetUrl(value, opts).ok;
}

/** An HTTP status code "100".."599", or the fallback literal "default". */
const RESPONSE_STATUS = /^[1-5][0-9][0-9]$/;
export function isValidResponseStatus(status: string): boolean {
    return status === "default" || RESPONSE_STATUS.test(status);
}

/**
 * Validates a source before storage. Returns the list of errors ([] = valid).
 * Pure — no I/O. Enforced unbypassably by `ValidatingSourceRepository`; callers
 * that want to fail a whole batch before writing (seed) call it directly.
 */
export function validateSource(source: Source): string[] {
    const errors: string[] = [];

    if (!isSourceUrn(source.urn)) {
        errors.push(`invalid source urn: "${source.urn}" (expected "urn:<id>")`);
    } else if (isSystemSourceUrn(source.urn)) {
        errors.push(`reserved system source urn: "${source.urn}"`);
    }

    const seen = new Set<string>();
    for (const ep of source.endpoints) {
        if (!isEndpointUrn(ep.urn)) {
            errors.push(`invalid endpoint urn: "${ep.urn}" (expected "urn:<source>:<endpoint>")`);
        } else if (!endpointBelongsToSource(ep.urn, source.urn)) {
            errors.push(`endpoint "${ep.urn}" does not belong to source "${source.urn}"`);
        }

        if (seen.has(ep.urn)) errors.push(`duplicate endpoint urn: "${ep.urn}"`);
        seen.add(ep.urn);

        if (!(HTTP_METHODS as readonly string[]).includes(ep.method)) {
            errors.push(`invalid method for "${ep.urn}": "${ep.method}"`);
        }
        const target = validateSourceTargetUrl(ep.targetUrl);
        if (!target.ok) {
            errors.push(`invalid targetUrl for "${ep.urn}": "${ep.targetUrl}" (${target.reason})`);
        }

        validateParams(ep, errors);
        validateHeaders(ep, errors);
        validateResponses(ep, errors);
    }

    return errors;
}

function validateParams(ep: SourceEndpoint, errors: string[]): void {
    const seen = new Set<string>();
    for (const p of ep.input?.params ?? []) {
        if (!p.name) {
            errors.push(`param without name for "${ep.urn}"`);
            continue;
        }
        if (seen.has(p.name)) errors.push(`duplicate param for "${ep.urn}": "${p.name}"`);
        seen.add(p.name);
        if (!(PARAM_INS as readonly string[]).includes(p.in)) {
            errors.push(`invalid param location for "${ep.urn}": "${p.in}" (expected ${PARAM_INS.join("|")})`);
        }
        if (p.source?.from === "computed") {
            if (p.in === "path") {
                errors.push(`computed param is not supported for path in "${ep.urn}": "${p.name}"`);
            }
            if (!(COMPUTED_PARAM_REFS as readonly string[]).includes(p.source.ref)) {
                errors.push(`invalid computed ref for "${ep.urn}": "${p.source.ref}"`);
            }
        } else if (p.source && p.source.from !== "request") {
            errors.push(`invalid param source for "${ep.urn}": "${(p.source as { from?: string }).from}"`);
        }
        // A header-param's NAME becomes an upstream header name (`buildUpstreamUrl`)
        // — hold it to the same policy as config headers, else `host`/`cookie`/…
        // could be smuggled in as a param.
        if (p.in === "header" && (!isValidHeaderName(p.name) || isForbiddenHeaderName(p.name))) {
            errors.push(`forbidden or invalid header param for "${ep.urn}": "${p.name}"`);
        }
    }
}

function normalizeHostname(value: string): string {
    return value.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

function parseIpv4(value: string): number[] | null {
    const parts = value.split(".");
    if (parts.length !== 4) return null;
    const out: number[] = [];
    for (const part of parts) {
        if (!/^[0-9]+$/.test(part)) return null;
        const n = Number(part);
        if (!Number.isInteger(n) || n < 0 || n > 255) return null;
        out.push(n);
    }
    return out;
}

function isBlockedIpv4(ip: readonly number[]): boolean {
    const a = ip[0]!;
    const b = ip[1]!;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
    );
}

function parseIpv6(value: string): number[] | null {
    const zoneLess = value.split("%")[0]!;
    if (!zoneLess.includes(":")) return null;

    let input = zoneLess;
    const ipv4Match = /(^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(input);
    if (ipv4Match) {
        const ipv4 = parseIpv4(ipv4Match[2]!);
        if (!ipv4) return null;
        const high = ((ipv4[0]! << 8) | ipv4[1]!).toString(16);
        const low = ((ipv4[2]! << 8) | ipv4[3]!).toString(16);
        input = `${input.slice(0, input.length - ipv4Match[2]!.length)}${high}:${low}`;
    }

    const halves = input.split("::");
    if (halves.length > 2) return null;

    const left = splitIpv6Half(halves[0]!);
    const right = halves.length === 2 ? splitIpv6Half(halves[1]!) : [];
    if (!left || !right) return null;

    const missing = 8 - left.length - right.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

    const groups = [...left, ...Array(missing).fill(0), ...right];
    const bytes: number[] = [];
    for (const group of groups) {
        bytes.push((group >> 8) & 0xff, group & 0xff);
    }
    return bytes;
}

function splitIpv6Half(value: string): number[] | null {
    if (!value) return [];
    const parts = value.split(":");
    const out: number[] = [];
    for (const part of parts) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
        out.push(parseInt(part, 16));
    }
    return out;
}

function isBlockedIpv6(bytes: readonly number[]): boolean {
    const allZero = bytes.every((b) => b === 0);
    const loopback = bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1;
    const uniqueLocal = (bytes[0]! & 0xfe) === 0xfc;                  // fc00::/7
    const linkLocal = bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80; // fe80::/10
    const multicast = bytes[0] === 0xff;
    const mappedIpv4 = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
    const compatibleIpv4 = bytes.slice(0, 12).every((b) => b === 0);
    const embeddedIpv4 = mappedIpv4 || compatibleIpv4 ? bytes.slice(12, 16) : null;
    return allZero || loopback || uniqueLocal || linkLocal || multicast || (!!embeddedIpv4 && isBlockedIpv4(embeddedIpv4));
}

function validateHeaders(ep: SourceEndpoint, errors: string[]): void {
    const headers = ep.headers ?? [];
    if (headers.length > MAX_ENDPOINT_HEADERS) {
        errors.push(`too many headers for "${ep.urn}": ${headers.length} (max ${MAX_ENDPOINT_HEADERS})`);
    }
    const seen = new Set<string>();
    for (const h of headers) {
        if (!isValidHeaderName(h.name) || isForbiddenHeaderName(h.name)) {
            errors.push(`forbidden or invalid header name for "${ep.urn}": "${h.name}"`);
            continue;
        }
        const key = h.name.toLowerCase();
        if (seen.has(key)) errors.push(`duplicate header for "${ep.urn}": "${h.name}"`);
        seen.add(key);
        if (h.source.from === "static" && !isValidHeaderValue(h.source.value)) {
            errors.push(`invalid header value for "${ep.urn}": "${h.name}"`);
        }
        if (h.source.from === "secret" && !h.source.ref) {
            errors.push(`secret header without ref for "${ep.urn}": "${h.name}"`);
        }
        if (h.source.from === "secret") {
            const prefix = (h.source as { prefix?: unknown }).prefix;
            if (prefix !== undefined && (typeof prefix !== "string" || !isValidHeaderValue(prefix))) {
                errors.push(`invalid header prefix for "${ep.urn}": "${h.name}"`);
            }
        }
        if (h.source.from === "computed" && !(COMPUTED_PARAM_REFS as readonly string[]).includes(h.source.ref)) {
            errors.push(`invalid computed ref for "${ep.urn}": "${h.source.ref}"`);
        }
        if (!["static", "secret", "computed"].includes((h.source as { from?: string }).from ?? "")) {
            errors.push(`invalid header source for "${ep.urn}": "${(h.source as { from?: string }).from}"`);
        }
    }
}

function validateResponses(ep: SourceEndpoint, errors: string[]): void {
    const seen = new Set<string>();
    for (const r of ep.output ?? []) {
        if (!isValidResponseStatus(r.status)) {
            errors.push(`invalid response status for "${ep.urn}": "${r.status}" (expected an HTTP code or "default")`);
        }
        if (seen.has(r.status)) errors.push(`duplicate response status for "${ep.urn}": "${r.status}"`);
        seen.add(r.status);
    }
}
