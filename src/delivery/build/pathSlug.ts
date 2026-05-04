/**
 * `TPage.path` is the canonical CMS identifier (always starts with "/",
 * always unique). The bucket needs two derived strings:
 *
 *  - `bucketName`  — the file's logical name inside the bucket. Must be
 *    unique within the bucket and stable for the same path. Used for
 *    listing, conflict detection and `getItems({ search })`.
 *
 *  - `publicPath`  — the URL slug the CDN serves. Visitors hit
 *    `https://<host>/<publicPath>` and expect to receive the page HTML.
 *    `/` (the home page) becomes `index.html` so the CDN's root request
 *    has a target file.
 */
export function pageBucketName(pagePath: string): string {
    if (pagePath === "/" || pagePath === "") return "index.html";
    return pagePath.replace(/^\//, "").replace(/\//g, "__") + ".html";
}

export function pagePublicPath(pagePath: string): string {
    if (pagePath === "/" || pagePath === "") return "index.html";
    return pagePath.replace(/^\//, "") + ".html";
}
