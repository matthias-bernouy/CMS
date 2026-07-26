import type { PublicPageRequestContext } from "cms-delivery/interfaces/PublicPageProvider";

const MAX_QUERY_BYTES = 4_096;
const MAX_QUERY_ENTRIES = 32;
const MAX_QUERY_NAME_BYTES = 128;
const MAX_QUERY_VALUE_BYTES = 1_024;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const MALFORMED_PERCENT_ESCAPE = /%(?![0-9a-f]{2})/iu;
const utf8 = new TextEncoder();

export class InvalidPublicPageRequestError extends Error {
    readonly status = 400;

    constructor() {
        super("Public page query is invalid");
        this.name = "InvalidPublicPageRequestError";
    }
}

export function publicPageRequestContext(search: string): PublicPageRequestContext {
    const query = search.startsWith("?") ? search.slice(1) : search;
    if (
        query.length > MAX_QUERY_BYTES ||
        utf8.encode(query).byteLength > MAX_QUERY_BYTES ||
        MALFORMED_PERCENT_ESCAPE.test(query)
    ) {
        throw new InvalidPublicPageRequestError();
    }
    const collected: Record<string, string[]> = Object.create(null);
    let entries = 0;
    for (const [name, value] of new URLSearchParams(query)) {
        entries += 1;
        if (
            entries > MAX_QUERY_ENTRIES ||
            !name ||
            CONTROL_CHARACTER.test(name) ||
            CONTROL_CHARACTER.test(value) ||
            utf8.encode(name).byteLength > MAX_QUERY_NAME_BYTES ||
            utf8.encode(value).byteLength > MAX_QUERY_VALUE_BYTES
        ) {
            throw new InvalidPublicPageRequestError();
        }
        (collected[name] ??= []).push(value);
    }
    for (const values of Object.values(collected)) {
        Object.freeze(values);
    }
    return Object.freeze({ searchParams: Object.freeze(collected), hasSearchParams: entries > 0 });
}
