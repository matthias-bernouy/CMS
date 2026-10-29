/** Explicit public, actor-independent assets of ulvia.cms.content/v1. Never classify Pages or Files. */
export function isPublicContentAsset(request: Request): boolean {
    if (request.method !== "GET" && request.method !== "HEAD") {
        return false;
    }
    const url = new URL(request.url);
    const query = url.searchParams;
    const keys = [...query.keys()];
    if (new Set(keys).size !== keys.length || !/^[0-9a-f]{10}$/.test(query.get("v") ?? "")) {
        return false;
    }
    if (["/_content/assets/bloc-runtime.js", "/_content/assets/cms-binding-core.js"].includes(url.pathname)) {
        return keys.length === 1;
    }
    if (
        !["/_content/style", "/_content/blocset", "/_content/blocstyles"].includes(url.pathname) ||
        !/^sha256:[0-9a-f]{64}$/.test(query.get("r") ?? "")
    ) {
        return false;
    }
    const allowed =
        url.pathname === "/_content/style"
            ? ["v", "r"]
            : url.pathname === "/_content/blocset"
              ? ["v", "r", "tags"]
              : ["v", "r", "tags", "collection"];
    return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}
