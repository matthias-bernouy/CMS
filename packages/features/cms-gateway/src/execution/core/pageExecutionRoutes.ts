export function pageCallPrefix(basePath: string): string {
    return `${basePath === "/" ? "" : basePath.replace(/\/$/u, "")}/.cms/call/`;
}

export function referringPagePath(request: Request, basePath: string): string | null {
    const raw = request.headers.get("referer");
    if (!raw) {
        return null;
    }
    try {
        const requestUrl = new URL(request.url);
        const referrer = new URL(raw);
        if (requestUrl.origin !== referrer.origin) {
            return null;
        }
        const base = basePath === "/" ? "" : basePath.replace(/\/$/u, "");
        if (base && referrer.pathname !== base && !referrer.pathname.startsWith(`${base}/`)) {
            return null;
        }
        const local = referrer.pathname.slice(base.length) || "/";
        return local.length > 1 && local.endsWith("/") ? local.slice(0, -1) : local;
    } catch {
        return null;
    }
}
