/**
 * Reads the `<meta name="basePath">` set by `serveStaticFolder` and returns
 * a *concat-ready* prefix:
 *   - root deployment           → `""`     so `+ "/admin/pages"` → `/admin/pages`
 *   - prefixed deployment       → `"/cms"` so `+ "/admin/pages"` → `/cms/admin/pages`
 *
 * Trailing slash and empty/missing meta are normalized away. Callers can
 * concat directly with a leading-slash path; never with a bare segment.
 */
export function getMetaBasePath(): string {
    const meta = document.querySelector('meta[name="basePath"]');
    const content = meta?.getAttribute("content") ?? "";
    if (!content || content === "/") {
        return "";
    }
    return content.replace(/\/+$/, "");
}
