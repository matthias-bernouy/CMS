import { CAPTURE_LIMITS, CaptureError, MemoryCaptureArtifacts, CaptureBudget } from "@bernouy/browser-capture";
import { createUnixCaptureClient } from "@bernouy/browser-capture/unix/client";
import { installedExampleCaptureDocument } from "@bernouy/repository/collections/build";
import { verifyStoredCollectionArtifact } from "@bernouy/repository/collections";
import type { ContentCaptures } from "@bernouy/content/captures";
import type { AuthoringServices } from "@bernouy/repository/features/authoring";
import type { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import type { ProviderStores } from "../../stores/providerStores";
import type { createPublicDelivery } from "../publicDelivery";

// Provider-wide bounds also apply when several instance compositions are warm.
const budget = new CaptureBudget();
const artifacts = new MemoryCaptureArtifacts();
export function createCaptureServices(
    stores: ProviderStores,
    delivery: ReturnType<typeof createPublicDelivery>,
    source: HttpCollectionRepository,
    socketPath?: string,
): {
    captures: ContentCaptures;
    authoringCaptures: NonNullable<AuthoringServices["authoringCaptures"]>;
} {
    const engine = createUnixCaptureClient(socketPath);
    return {
        captures: {
            run: (work) => budget.run(work),
            engine,
            artifacts,
            pageDocument: (page, input, context) =>
                delivery
                    .captureDelivery(context)
                    .captureDocument(page, input.locale, input.options.themeMode, context.signal),
            exampleDocument: (input, context) =>
                installedExampleCaptureDocument(stores.collections, context.siteId, input),
            revision: async () =>
                JSON.stringify([
                    await stores.repo.getSystemRevision(),
                    await stores.repo.getSiteBlocsRevision(),
                    await stores.collections.revision("default"),
                ]),
        },
        authoringCaptures: {
            run: (work) => budget.run(work),
            engine,
            artifacts,
            dependencies: async (references, maxAssetBytes) => {
                const results = [];
                let budget = Math.min(CAPTURE_LIMITS.inputBytes, maxAssetBytes);
                for (const reference of references) {
                    const bundle = await source.get(reference, { maxAssetBytes: budget });
                    const artifact = await verifyStoredCollectionArtifact(
                        bundle.release,
                        bundle.assets,
                        reference.digest,
                    );
                    budget -= artifact.assets.reduce((sum, asset) => sum + asset.bytes.size, 0);
                    if (budget < 0) {
                        throw new CaptureError("LIMIT_EXCEEDED");
                    }
                    results.push(artifact);
                }
                return results;
            },
        },
    };
}
