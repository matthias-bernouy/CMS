import { dirname } from "node:path";
import { buildFsIntegrationRegistryCatalogSnapshot } from "../../../snapshot/builder";
import type { FsIntegrationRegistryStablePromotionPaths } from "../layout";
import type { FsIntegrationRegistryStablePromoterConfig } from "../types";
import type { IntegrationRegistryStablePromotionRecord } from "../../../../../interfaces/promotion";

export async function buildAndSwapStablePromotionSnapshot(
    config: FsIntegrationRegistryStablePromoterConfig,
    paths: FsIntegrationRegistryStablePromotionPaths,
    record: IntegrationRegistryStablePromotionRecord,
) {
    while (true) {
        const expected = config.snapshots.current();
        const next = await buildFsIntegrationRegistryCatalogSnapshot({
            root: config.root,
            packageLimits: config.packageLimits,
        });
        const index = next.getIndex(record.kind);
        const location = next.locateExactVersion(record.kind, record.version);
        if (
            index?.stable !== record.version ||
            !location ||
            location.package.digest !== record.packageDigest ||
            location.integrationRoot !== dirname(paths.index)
        ) {
            throw new Error("Stable promotion is absent from the fully validated candidate snapshot");
        }
        if (config.snapshots.compareAndSwap(expected, next)) {
            return next;
        }
    }
}
