import { randomUUID } from "node:crypto";
import { writeImmutableIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../interfaces/catalog";
import { ensureFsIntegrationRegistryLayout, ensurePublicationPaths } from "../persistence/layout";
import { removeImmutableTreeIfExists } from "../persistence/tree";
import { prepareFsIntegrationRegistryCandidate } from "./candidate";
import { commitFsIntegrationRegistryPublication } from "./transaction/commit";
import {
    FsIntegrationRegistryRecoveryRequiredError,
    FsIntegrationRegistrySimulatedCrashError,
    type FsIntegrationRegistryPublicationConfig,
} from "./types";

export async function publishPreparedFsIntegrationRegistryCandidate(
    config: FsIntegrationRegistryPublicationConfig,
    candidate: Awaited<ReturnType<typeof prepareFsIntegrationRegistryCandidate>>,
    versionStatus?: "unverified",
    verificationDigest?: string,
    validateUnderLock?: (snapshot: IntegrationRegistryCatalogSnapshot) => Promise<void>,
) {
    const operationId = config.createOperationId?.() ?? randomUUID();
    const layout = await ensureFsIntegrationRegistryLayout(config.root);
    const paths = await ensurePublicationPaths(
        layout,
        candidate.definition.kind,
        candidate.package.envelope.version,
        operationId,
    );
    await writeImmutableIntegrationPackageDirectory(candidate.package, {
        destination: paths.stagingRoot,
        expected: {
            kind: candidate.definition.kind,
            version: candidate.package.envelope.version,
            digest: candidate.package.digest,
        },
        limits: candidate.limits,
    });
    try {
        return await config.mutations.runExclusive(candidate.definition.kind, async () => {
            return await commitFsIntegrationRegistryPublication({
                config,
                layout,
                paths,
                operationId,
                candidate,
                ...(versionStatus ? { versionStatus } : {}),
                ...(verificationDigest ? { verificationDigest } : {}),
                ...(validateUnderLock ? { validateUnderLock } : {}),
            });
        });
    } catch (error) {
        if (
            !(error instanceof FsIntegrationRegistrySimulatedCrashError) &&
            !(error instanceof FsIntegrationRegistryRecoveryRequiredError)
        ) {
            await removeImmutableTreeIfExists(paths.stagingRoot);
        }
        throw error;
    }
}
