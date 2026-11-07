import { applicationHeaderName, selectRequestHeaders, snapshotHeaders } from "./headers";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";

export const REQUEST_CONTEXT_HEADER = "x-ulvia-request-context";
export interface GatewayRequestContext {
    readonly headers: Readonly<Record<string, string>>;
    /** Present only when the invocation represents a distinct public resource request. */
    readonly resource?: { readonly url?: string; readonly method: "GET" | "HEAD" };
}
export function snapshotRequestContext(value: unknown): GatewayRequestContext {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid request context");
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((name) => name !== "headers" && name !== "resource")) {
        throw new TypeError("Unknown request context field");
    }
    const names = record.headers && typeof record.headers === "object" ? Object.keys(record.headers) : [];
    if (names.some((name) => !applicationHeaderName(name))) {
        throw new TypeError("Reserved context header");
    }
    const headers = snapshotHeaders(record.headers, new Set(names));
    if (record.resource === undefined) {
        return Object.freeze({ headers });
    }
    const resource = record.resource as Record<string, unknown>;
    if (
        !resource ||
        Object.keys(resource).some((field) => !["method", "url"].includes(field)) ||
        !["GET", "HEAD"].includes(String(resource.method)) ||
        (resource.url !== undefined && (typeof resource.url !== "string" || resource.url.length > 16_384))
    ) {
        throw new TypeError("Invalid resource request");
    }
    const method = resource.method as "GET" | "HEAD";
    if (resource.url === undefined) {
        return Object.freeze({ headers, resource: Object.freeze({ method }) });
    }
    const url = new URL(resource.url as string);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password || url.hash) {
        throw new TypeError("Invalid resource URL");
    }
    return Object.freeze({
        headers,
        resource: Object.freeze({ url: url.href, method: resource.method as "GET" | "HEAD" }),
    });
}
export function requestContext(
    request: Request,
    resource = false,
    custom: readonly string[] = [],
): GatewayRequestContext {
    const headers = selectRequestHeaders(request.headers, custom);
    const method = request.method as "GET" | "HEAD";
    const context = snapshotRequestContext({
        headers,
        ...(resource ? { resource: { method, ...(request.url.length <= 16_384 ? { url: request.url } : {}) } } : {}),
    });
    // URL is only a convenience view; business path/query remain in admitted input.
    // Do not shrink the URL/input budget merely to duplicate it in a header.
    if (resource && encodeURIComponent(JSON.stringify({ version: 1, ...context })).length > 8192) {
        return snapshotRequestContext({ headers, resource: { method } });
    }
    return context;
}
export function encodeRequestContext(value: GatewayRequestContext): string {
    const encoded = encodeURIComponent(JSON.stringify({ version: 1, ...snapshotRequestContext(value) }));
    if (encoded.length > 8192) {
        throw new TypeError("Encoded request context exceeds its wire budget");
    }
    return encoded;
}
export function decodeRequestContext(value: string | null): GatewayRequestContext | undefined {
    if (value === null) {
        return undefined;
    }
    if (value.length > 8192) {
        throw new TypeError("Request context is too large");
    }
    const parsed = parseStrictJson(new TextEncoder().encode(decodeURIComponent(value)), 49_152, 8) as Record<
        string,
        unknown
    >;
    if (!parsed || parsed.version !== 1) {
        throw new TypeError("Unsupported request context version");
    }
    const { version: _version, ...context } = parsed;
    return snapshotRequestContext(context);
}
