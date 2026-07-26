import { buildFsIntegrationRegistryCatalogSnapshot } from "../../../snapshot/builder";
import type { FsIntegrationRegistryLayout } from "../../persistence/layout";
import type { PreparedFsIntegrationRegistryCandidate } from "../candidate";
import type { FsIntegrationRegistryPublicationConfig } from "../types";

export async function buildAndSwapPublicationSnapshot(
    config: FsIntegrationRegistryPublicationConfig,
    layout: FsIntegrationRegistryLayout,
    candidate: PreparedFsIntegrationRegistryCandidate,
) {
    while (true) {
        const expected = config.snapshots.current();
        const next = await buildFsIntegrationRegistryCatalogSnapshot({
            root: layout.root,
            packageLimits: candidate.limits,
        });
        const location = next.locateExactVersion(candidate.definition.kind, candidate.package.envelope.version);
        if (!location || location.package.digest !== candidate.package.digest) {
            throw new Error("Published integration version is absent from the fully validated candidate snapshot");
        }
        if (config.snapshots.compareAndSwap(expected, next)) {
            return next;
        }
    }
}
