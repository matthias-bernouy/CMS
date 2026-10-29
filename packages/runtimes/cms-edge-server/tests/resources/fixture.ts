import type { CacheLoad } from "../../src/runtime/resources/cache/types";
export const request = (path = "/page", headers: Record<string, string> = {}, method = "GET") =>
    new Request(`https://site.example${path}`, { headers, method });
export function resource(body = "page", cacheControl = "public, no-cache, s-maxage=15", status = 200) {
    return {
        response: new Response(body, {
            status,
            headers: {
                "cache-control": cacheControl.replace(/,?\s*s-maxage=\d+/, ""),
                "content-type": "text/html",
                etag: '"version"',
            },
        }),
        cacheControl,
    };
}
export function loader(control = "public, no-cache, s-maxage=15") {
    let calls = 0;
    const load: CacheLoad = async () => {
        calls++;
        return resource(`page-${calls}`, control);
    };
    return { load, calls: () => calls };
}
export function barrier() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
}
