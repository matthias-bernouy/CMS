import { sharedPolicy } from "./policy";
import { readCacheBody } from "./readBody";
import { gzipVariant } from "./representation";
import type { CacheLoad, CacheOptions, CachedResource } from "./types";
export async function loadCacheResource(
    key: string,
    request: Request,
    load: CacheLoad,
    options: CacheOptions,
    now: () => number,
): Promise<CachedResource | Response> {
    const startedAt = now();
    const { response, cacheControl, tags = [] } = await load(request);
    if (response.status >= 500) {
        return response;
    }
    const policy =
        response.status === 200 &&
        (response.headers.get("vary") ?? "")
            .split(",")
            .every(
                (name) =>
                    !name.trim() ||
                    ["accept", "accept-language", "accept-encoding"].includes(name.trim().toLowerCase()),
            ) &&
        !/(?:private|no-store)/i.test(response.headers.get("cache-control") ?? "no-store") &&
        !response.headers.has("set-cookie")
            ? sharedPolicy(cacheControl, options.pages !== false)
            : null;
    if (!policy) {
        return response;
    }
    const maximum = options.maxEntryBytes ?? 1024 * 1024;
    const body = await readCacheBody(response, maximum);
    if (body instanceof Response) {
        return body;
    }
    const headers = [...response.headers];
    const gzip = gzipVariant(body, response.headers.get("content-type"));
    const bytes =
        body.byteLength +
        (gzip?.byteLength ?? 0) +
        new TextEncoder().encode(JSON.stringify([key, headers, tags])).byteLength;
    const entry: CachedResource = {
        key,
        tags,
        headers,
        raw: body,
        ...(gzip ? { gzip } : {}),
        storedAt: startedAt,
        policy,
        bytes,
    };
    return entry;
}
