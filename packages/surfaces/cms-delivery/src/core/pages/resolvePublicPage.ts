import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { PublicPageResolution } from "cms-delivery/interfaces/PublicPageProvider";
import { assertPublicPagePath } from "cms-delivery/core/pages/publicPagePaths";

const MAX_CACHE_IDENTITY_LENGTH = 256;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export async function resolvePublicPage(pathname: string, delivery: DeliveryCms): Promise<PublicPageResolution | null> {
    for (const provider of delivery.publicPageProviders) {
        const resolved = await provider.resolvePage(pathname);
        if (!resolved) {
            continue;
        }
        assertPublicPagePath(resolved.page?.path);
        if (resolved.page.path !== pathname) {
            throw new TypeError("public page provider returned a page for a different pathname");
        }
        assertCacheIdentity(resolved.cacheIdentity);
        return resolved;
    }
    return null;
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
