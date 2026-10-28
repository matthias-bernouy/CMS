export const RESOURCE_HEADER = "x-ulvia-resource";
export interface ResourceMetadata {
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
}
const STATUSES = new Set([200, 206, 301, 302, 303, 304, 307, 308, 400, 401, 403, 404, 410, 416, 422, 500, 503]);
const HEADERS = new Set([
    "content-type",
    "content-length",
    "content-language",
    "content-range",
    "accept-ranges",
    "content-disposition",
    "etag",
    "last-modified",
    "location",
    "cache-control",
    "retry-after",
    "x-robots-tag",
]);
/** Metadata is closed and bounded; security headers and cookies never come from a resource Provider. */
export function parseResourceMetadata(value: unknown): ResourceMetadata {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid resource metadata");
    }
    const record = value as Record<string, unknown>;
    if (
        Object.keys(record).sort().join() !== "headers,status" ||
        !STATUSES.has(Number(record.status)) ||
        typeof record.status !== "number" ||
        !record.headers ||
        typeof record.headers !== "object" ||
        Array.isArray(record.headers)
    ) {
        throw new TypeError("Invalid resource metadata");
    }
    const headers: Record<string, string> = {};
    for (const [name, content] of Object.entries(record.headers)) {
        if (
            !HEADERS.has(name) ||
            typeof content !== "string" ||
            content.length > 2048 ||
            /[\x00-\x1f\x7f]/u.test(content)
        ) {
            throw new TypeError("Unsafe resource header");
        }
        headers[name] = content;
    }
    if (
        [200, 206, 304].includes(record.status) &&
        (!headers["content-type"] ||
            !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+(?:;.*)?$/u.test(headers["content-type"]))
    ) {
        throw new TypeError("Resource representation requires a media type");
    }
    if ((record.status === 304 || [301, 302, 303, 307, 308].includes(record.status)) && headers["content-range"]) {
        throw new TypeError("Invalid resource range");
    }
    if ([301, 302, 303, 307, 308].includes(record.status)) {
        const location = headers.location;
        if (
            !location ||
            /[\\\s]/u.test(location) ||
            (!location.startsWith("/") && !/^https?:\/\//iu.test(location)) ||
            location.startsWith("//")
        ) {
            throw new TypeError("Invalid resource redirect");
        }
        const url = new URL(location, "https://resource.invalid");
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
            throw new TypeError("Invalid resource redirect");
        }
    }
    if (headers["content-length"] !== undefined && !/^(?:0|[1-9][0-9]{0,14})$/u.test(headers["content-length"])) {
        throw new TypeError("Invalid resource length");
    }
    return Object.freeze({ status: record.status, headers: Object.freeze(headers) });
}
export function decodeResourceMetadata(header: string | null): ResourceMetadata | undefined {
    if (header === null) {
        return undefined;
    }
    if (header.length > 16_384) {
        throw new TypeError("Resource metadata is too large");
    }
    return parseResourceMetadata(JSON.parse(header));
}
