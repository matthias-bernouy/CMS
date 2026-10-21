import { publicAssetCacheControl, sendCompressed, type Cache } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS } from "cms-content/application/core/cacheKeys";
import type { ContentReader } from "cms-content/application/interfaces/ContentReader";
import { digestContentRevision } from "cms-content/blocs/core/assets/resolvePageAssets";
import { generateStyleEntry } from "cms-content/theme/core/generateStyleEntry";

const REVISION = /^sha256:[0-9a-f]{64}$/u;
const VERSION = /^[0-9a-f]{10}$/u;

/** Serve one exact immutable theme stylesheet emitted by a rendered Page. */
export async function serveThemeStyle(
    request: Request,
    options: {
        content: Pick<ContentReader, "getContentRevision" | "getRenderingRevision" | "getRenderingSettings">;
        cache: Cache;
        resolveContributedAssets(input: string): Promise<string>;
    },
): Promise<Response> {
    const url = new URL(request.url);
    const revision = url.searchParams.get("r");
    const version = url.searchParams.get("v");
    if (!revision || !REVISION.test(revision) || !version || !VERSION.test(version)) {
        return new Response(null, { status: 400 });
    }
    const key = CMS_CACHE_KEYS.style(revision);
    let entry = options.cache.get(key);
    if (entry) {
        return entry.hash === version
            ? sendCompressed(request, entry, publicAssetCacheControl(request))
            : new Response(null, { status: 404 });
    }
    const currentRevision = await digestContentRevision(
        (await options.content.getRenderingRevision?.()) ?? (await options.content.getContentRevision?.()) ?? 0,
    );
    if (revision !== currentRevision) {
        return new Response(null, { status: 404 });
    }
    entry = await generateStyleEntry(options.content, [], options.resolveContributedAssets);
    if (entry.hash !== version) {
        return new Response(null, { status: 404 });
    }
    options.cache.set(key, entry);
    return sendCompressed(request, entry, publicAssetCacheControl(request));
}
