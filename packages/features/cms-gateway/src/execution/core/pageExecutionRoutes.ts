export function sourceRoute(rawUrl: string, pageUrl: URL, prefix: string): { contractId: string; path: string } | null {
    try {
        const url = new URL(rawUrl, pageUrl);
        if (url.origin !== pageUrl.origin || !url.pathname.startsWith(prefix)) {
            return null;
        }
        const suffix = url.pathname.slice(prefix.length);
        const separator = suffix.indexOf("/");
        const contractId = decodeURIComponent(separator < 0 ? suffix : suffix.slice(0, separator));
        return contractId ? { contractId, path: separator < 0 ? "/" : suffix.slice(separator) } : null;
    } catch {
        return null;
    }
}

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
