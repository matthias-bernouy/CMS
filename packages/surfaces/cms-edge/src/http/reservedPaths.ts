/** Reserved public protocol paths never reach the selected Content Provider. */
export function isEdgeReservedPath(path: string, cmsPathPrefix = "/.cms"): boolean {
    return (
        path === cmsPathPrefix ||
        path.startsWith(`${cmsPathPrefix}/`) ||
        path === "/healthz" ||
        path === "/readyz" ||
        path.startsWith("/.well-known/oauth-")
    );
}
