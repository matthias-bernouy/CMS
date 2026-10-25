import { FAVICON_ROUTE } from "cms-kernel/http/assets/favicon";
import { matchRootSitemapChunkPath } from "@bernouy/cms-content/seo";

export function isKernelReservedPath(path: string, cmsPathPrefix: string): boolean {
    if (
        [
            "/.well-known/oauth-protected-resource",
            "/.well-known/oauth-protected-resource/.cms/mcp",
            "/.well-known/oauth-authorization-server",
        ].includes(path)
    ) {
        return true;
    }
    if (path === "/robots.txt" || path === "/sitemap.xml" || path === FAVICON_ROUTE) {
        return true;
    }
    if (matchRootSitemapChunkPath(path)) {
        return true;
    }
    return path === cmsPathPrefix || path.startsWith(cmsPathPrefix + "/");
}
