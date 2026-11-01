export const RESOURCE_HEADER = "x-ulvia-resource";
export interface ResourceMetadata {
    readonly vary?: readonly string[];
    readonly cacheTags?: readonly string[];
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
}
const STATUSES = new Set([
    200, 201, 202, 204, 205, 206, 301, 302, 303, 304, 307, 308, 400, 401, 403, 404, 406, 409, 410, 412, 416, 422, 429,
    500, 502, 503, 504,
]);
const HEADERS = new Set([
    "content-type",
    "content-length",
    "content-language",
    "content-range",
    "accept-ranges",
    "content-disposition",
    "etag",
    "last-modified",
    "expires",
    "vary",
    "link",
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
        Object.keys(record).some((key) => !["headers", "status", "vary", "cacheTags"].includes(key)) ||
        !STATUSES.has(Number(record.status)) ||
        typeof record.status !== "number" ||
        !record.headers ||
        typeof record.headers !== "object" ||
        Array.isArray(record.headers)
    ) {
        throw new TypeError("Invalid resource metadata");
    }
    if (
        record.vary !== undefined &&
        (!Array.isArray(record.vary) || new Set(record.vary).size !== record.vary.length)
    ) {
        throw new TypeError("Invalid Vary dimensions");
    }
    const vary = boundedList(
        record.vary === undefined && !(record.headers as Record<string, unknown>).vary
            ? undefined
            : [
                  ...new Set([
                      ...(Array.isArray(record.vary) ? record.vary : record.vary === undefined ? [] : [record.vary]),
                      ...String((record.headers as Record<string, unknown>).vary ?? "")
                          .split(",")
                          .map((name) => name.trim().toLowerCase())
                          .filter(Boolean),
                  ]),
              ],
        16,
        (value) => value === "*" || value === "accept-encoding" || applicationHeaderName(value),
    );
    const cacheTags = boundedList(record.cacheTags, 32, (value) => /^[a-z0-9][a-z0-9:._-]{0,127}$/u.test(value));
    const headers: Record<string, string> = {};
    for (const [name, content] of Object.entries(record.headers)) {
        if (
            !HEADERS.has(name) ||
            typeof content !== "string" ||
            content.length > MAX_APPLICATION_HEADER_VALUE ||
            /[\x00-\x1f\x7f]/u.test(content)
        ) {
            throw new TypeError("Unsafe resource header");
        }
        headers[name] = content;
    }
    if (
        ([200, 206].includes(record.status) || headers["content-type"] !== undefined) &&
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
    return Object.freeze({
        status: record.status,
        headers: Object.freeze(headers),
        ...(vary ? { vary: Object.freeze(vary) } : {}),
        ...(cacheTags ? { cacheTags: Object.freeze(cacheTags) } : {}),
    });
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

function boundedList(value: unknown, maximum: number, valid: (value: string) => boolean): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (
        !Array.isArray(value) ||
        value.length > maximum ||
        new Set(value).size !== value.length ||
        value.some((item) => typeof item !== "string" || !valid(item))
    ) {
        throw new TypeError("Invalid resource cache metadata");
    }
    return [...value];
}

import { applicationHeaderName, MAX_APPLICATION_HEADER_VALUE } from "cms-gateway/protocol/http/headers";
