import { getMetaBasePath } from "src/control/core/dom/meta/getMetaBasePath";

/**
 * Browser-side helper for consumer bloc editors. Resolves the response
 * fields of an OpenAPI endpoint into a flat list of dotted paths,
 * suitable for richtextbar autocomplete.
 *
 * `url` is the value emitted by `<cms-schema-picker>` — a data-proxy URL
 * of the shape `<DATA_PROXY_PREFIX>/<providerId>/<path>`. `method`
 * defaults to GET (most consumer blocs are GET-only); pass it explicitly
 * when the bloc supports other verbs.
 *
 * The admin's base path is resolved from `<meta name="basePath">` via
 * `getMetaBasePath`, so the helper works under any tenant prefix.
 *
 * Returns `[]` on any failure (network error, missing url, provider not
 * synced, etc.) so consumers can keep autocomplete logic branch-free.
 */
export async function getFields(url: string, opts: { method?: string } = {}): Promise<string[]> {
    if (!url) return [];
    const method   = opts.method ?? "GET";
    const basePath = getMetaBasePath();
    const params   = new URLSearchParams({ url, method });
    try {
        const res = await fetch(`${basePath}/api/data/provider/fields?${params}`);
        return res.ok ? await res.json() as string[] : [];
    } catch {
        return [];
    }
}
