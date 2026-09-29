import type DeliveryCms from "cms-delivery/DeliveryCms";
import { getOrGenerateEntryAsync, sendCompressed } from "@bernouy/http-runner";
import { componentJsCacheKey, generateComponentJsEntry } from "cms-delivery/core/assets/buildComponent";

const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const REVALIDATED_ASSET_CACHE_CONTROL = "no-cache, must-revalidate";

/**
 * Serves the component runtime bundle at `<cmsPathPrefix>/assets/component.js`.
 * Unknown hashes fail closed instead of poisoning an immutable URL.
 */
export default async function ComponentServer(req: Request, delivery: DeliveryCms) {
    const url = new URL(req.url);
    const requestedVersions = url.searchParams.getAll("v");
    const currentEntry = await getOrGenerateEntryAsync(
        componentJsCacheKey(url.pathname),
        delivery.cache,
        generateComponentJsEntry,
    );
    if (requestedVersions.length === 0) {
        return sendCompressed(req, currentEntry, REVALIDATED_ASSET_CACHE_CONTROL);
    }
    if (requestedVersions.length !== 1) {
        return unknownVersionResponse();
    }
    if (requestedVersions[0] === currentEntry.hash) {
        return sendCompressed(req, currentEntry, IMMUTABLE_ASSET_CACHE_CONTROL);
    }

    return unknownVersionResponse();
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
