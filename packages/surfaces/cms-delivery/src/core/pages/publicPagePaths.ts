import type { PublicPageProvider } from "cms-delivery/interfaces/PublicPageProvider";
import { FAVICON_ROUTE } from "cms-delivery/core/assets/defaultFavicon";

const MAX_PUBLIC_PAGE_PATH_LENGTH = 2048;
const MAX_PUBLIC_SITEMAP_PATHS = 10_000;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** Validate one canonical, origin-relative public page path. */
export function assertPublicPagePath(path: unknown): asserts path is string {
    if (
        typeof path !== "string" ||
        path.length === 0 ||
        path.length > MAX_PUBLIC_PAGE_PATH_LENGTH ||
        !path.startsWith("/") ||
        path.startsWith("//") ||
        path.includes("\\") ||
        path.includes("?") ||
        path.includes("#") ||
        CONTROL_CHARACTER.test(path)
    ) {
        throw new TypeError("public page path must be a canonical origin-relative pathname");
    }

    const parsed = new URL(path, "https://delivery.invalid");
    if (parsed.origin !== "https://delivery.invalid" || parsed.pathname !== path) {
        throw new TypeError("public page path must not contain an origin or dot-segment alias");
    }
}

export function isDeliveryReservedPath(path: string, cmsPathPrefix: string): boolean {
    if (path === "/robots.txt" || path === "/sitemap.xml" || path === FAVICON_ROUTE) {
        return true;
    }
    return path === cmsPathPrefix || path.startsWith(cmsPathPrefix + "/");
}

/** Collect validated, deduplicated provider paths without trusting provider output. */
export async function collectPublicPageProviderPaths(
    providers: readonly PublicPageProvider[],
    cmsPathPrefix: string,
): Promise<readonly string[]> {
    const paths = new Set<string>();
    for (const provider of providers) {
        if (!provider.listSitemapPaths) {
            continue;
        }
        const provided = await provider.listSitemapPaths();
        if (!Array.isArray(provided)) {
            throw new TypeError("public page provider sitemap paths must be an array");
        }
        for (const path of provided) {
            assertPublicPagePath(path);
            if (isDeliveryReservedPath(path, cmsPathPrefix)) {
                continue;
            }
            paths.add(path);
            if (paths.size > MAX_PUBLIC_SITEMAP_PATHS) {
                throw new RangeError("public page provider sitemap path limit exceeded");
            }
        }
    }
    return [...paths];
}
