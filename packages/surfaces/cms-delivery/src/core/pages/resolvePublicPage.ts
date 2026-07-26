import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { PublicPageResolution } from "cms-delivery/interfaces/PublicPageProvider";
import { assertPublicPagePath } from "cms-delivery/core/pages/publicPagePaths";
import { publicPageRequestContext } from "cms-delivery/core/pages/publicPageRequest";

const MAX_CACHE_IDENTITY_LENGTH = 256;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export async function resolvePublicPage(
    pathname: string,
    delivery: DeliveryCms,
    search = "",
): Promise<PublicPageResolution | null> {
    const context = publicPageRequestContext(search);
    for (const provider of delivery.publicPageProviders) {
        const resolved = await provider.resolvePage(pathname, context);
        if (!resolved) {
            continue;
        }
        assertPublicPagePath(resolved.page?.path);
        if (resolved.page.path !== pathname) {
            throw new TypeError("public page provider returned a page for a different pathname");
        }
        assertPageStatus(resolved.status);
        assertCacheIdentity(resolved.cacheIdentity);
        if (resolved.status !== undefined && resolved.status !== 200 && resolved.cacheIdentity !== undefined) {
            throw new TypeError("public page provider error responses must not be cached");
        }
        return resolved;
    }
    return null;
}

function assertPageStatus(status: number | undefined): void {
    if (status === undefined || status === 200) {
        return;
    }
    if (!Number.isSafeInteger(status) || status < 400 || status > 599) {
        throw new TypeError("public page provider status must be 200 or an HTTP error status");
    }
}

export function publicPageCacheKey(pathname: string, identity: string): string {
    return `public-page:${JSON.stringify([pathname, identity])}`;
}

function assertCacheIdentity(identity: string | undefined): void {
    if (identity === undefined) {
        return;
    }
    if (
        typeof identity !== "string" ||
        identity.length === 0 ||
        identity.length > MAX_CACHE_IDENTITY_LENGTH ||
        CONTROL_CHARACTER.test(identity)
    ) {
        throw new TypeError("public page cache identity must be a bounded non-empty string");
    }
}
