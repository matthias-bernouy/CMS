/** Application metadata only. Credentials, authority and connection headers are never forwarded. */
export const MAX_APPLICATION_HEADER_VALUE = 4096;
export const REQUEST_HEADERS = new Set([
    "accept",
    "accept-language",
    "if-none-match",
    "if-modified-since",
    "if-match",
    "if-unmodified-since",
    "range",
    "if-range",
    "cache-control",
    "pragma",
    "content-language",
]);
export const RESPONSE_HEADERS = new Set([
    "retry-after",
    "etag",
    "content-disposition",
    "content-range",
    "accept-ranges",
    "cache-control",
    "last-modified",
    "content-language",
    "expires",
    "vary",
    "location",
    "link",
]);
const RESERVED =
    /^(?:authorization|cookie|set-cookie|host|connection|content-(?:type|length|encoding)|accept-encoding|expect|forwarded|idempotency-key|keep-alive|origin|referer|te|trailer|traceparent|tracestate|transfer-encoding|upgrade|user-agent|via|baggage|x-real-ip|x-request-id)$/u;
export function applicationHeaderName(name: string): boolean {
    return (
        /^[a-z0-9!#$%&'*+.^_`|~-]+$/u.test(name) &&
        !RESERVED.test(name) &&
        !["proxy-", "sec-", "x-cms-", "x-forwarded-", "x-ulvia-"].some((prefix) => name.startsWith(prefix))
    );
}
export function snapshotHeaders(value: unknown, allowed = REQUEST_HEADERS): Readonly<Record<string, string>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Headers must be a bounded record");
    }
    const result: Record<string, string> = {};
    let bytes = 0;
    const entries = Object.entries(value);
    if (entries.length > 32) {
        throw new TypeError("Too many application headers");
    }
    for (const [name, content] of entries) {
        if (
            !allowed.has(name) ||
            typeof content !== "string" ||
            content.length > MAX_APPLICATION_HEADER_VALUE ||
            /[\x00-\x1f\x7f]/u.test(content)
        ) {
            throw new TypeError("Invalid application header");
        }
        bytes += new TextEncoder().encode(name + content).byteLength;
        if (bytes > 12_288) {
            throw new TypeError("Application headers exceed their budget");
        }
        result[name] = content;
    }
    return Object.freeze(result);
}
export function selectRequestHeaders(
    headers: Headers,
    custom: readonly string[] = [],
): Readonly<Record<string, string>> {
    if (custom.some((name) => !applicationHeaderName(name))) {
        throw new TypeError("Custom headers cannot override reserved headers");
    }
    const allowed = new Set([...REQUEST_HEADERS, ...custom]);
    return snapshotHeaders(Object.fromEntries([...headers].filter(([name]) => allowed.has(name))), allowed);
}
export function selectResponseHeaders(headers: Headers): Readonly<Record<string, string>> {
    return snapshotHeaders(
        Object.fromEntries([...headers].filter(([name]) => RESPONSE_HEADERS.has(name))),
        RESPONSE_HEADERS,
    );
}
