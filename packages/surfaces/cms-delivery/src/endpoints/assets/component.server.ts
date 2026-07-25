import type DeliveryCms from "cms-delivery/DeliveryCms";
import { getOrGenerateEntryAsync, sendCompressed } from "@bernouy/http-runner";
import type { ResponsiveSourceImageRollout } from "@bernouy/cms-source-images/browser-host";
import {
    componentJsCacheKey,
    generateComponentJsEntry,
    RESPONSIVE_SOURCE_IMAGE_ROLLOUT_VARIANTS,
} from "cms-delivery/core/assets/buildComponent";

const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const REVALIDATED_ASSET_CACHE_CONTROL = "no-cache, must-revalidate";

/**
 * Serves the component runtime bundle at `<cmsPathPrefix>/assets/component.js`.
 * A content-hashed URL keeps serving its exact rollout variant after a flag
 * transition. Unknown hashes fail closed instead of poisoning an immutable URL.
 */
export default async function ComponentServer(req: Request, delivery: DeliveryCms) {
    const url = new URL(req.url);
    const requestedVersions = url.searchParams.getAll("v");
    const currentRollout = delivery.responsiveSourceImageRollout;
    const currentEntry = await componentEntry(delivery, url.pathname, currentRollout);
    if (requestedVersions.length === 0) {
        return sendCompressed(req, currentEntry, REVALIDATED_ASSET_CACHE_CONTROL);
    }
    if (requestedVersions.length !== 1) {
        return unknownVersionResponse();
    }
    if (requestedVersions[0] === currentEntry.hash) {
        return sendCompressed(req, currentEntry, IMMUTABLE_ASSET_CACHE_CONTROL);
    }

    for (const rollout of RESPONSIVE_SOURCE_IMAGE_ROLLOUT_VARIANTS) {
        if (sameRollout(rollout, currentRollout)) {
            continue;
        }
        const historicalEntry = await componentEntry(delivery, url.pathname, rollout);
        if (requestedVersions[0] === historicalEntry.hash) {
            return sendCompressed(req, historicalEntry, IMMUTABLE_ASSET_CACHE_CONTROL);
        }
    }
    return unknownVersionResponse();
}

async function componentEntry(delivery: DeliveryCms, pathname: string, rollout: ResponsiveSourceImageRollout) {
    return getOrGenerateEntryAsync(componentJsCacheKey(pathname, rollout), delivery.cache, () =>
        generateComponentJsEntry(rollout),
    );
}

function sameRollout(left: ResponsiveSourceImageRollout, right: ResponsiveSourceImageRollout): boolean {
    return left.public === right.public && left.private === right.private;
}

function unknownVersionResponse(): Response {
    return new Response(null, {
        status: 404,
        headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
