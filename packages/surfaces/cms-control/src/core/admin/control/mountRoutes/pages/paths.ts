export function controlPagePath(pathname: string, basePath: string): string | null {
    const base = basePath === "/" ? "" : basePath.replace(/\/$/u, "");
    if (base && pathname !== base && !pathname.startsWith(`${base}/`)) {
        return null;
    }
    const local = pathname.slice(base.length) || "/";
    return local.length > 1 && local.endsWith("/") ? local.slice(0, -1) : local;
}

export function controlAssetPath(basePath: string, path: string): string {
    const base = basePath === "/" ? "" : basePath.replace(/\/$/u, "");
    return `${base}${path}`;
}
