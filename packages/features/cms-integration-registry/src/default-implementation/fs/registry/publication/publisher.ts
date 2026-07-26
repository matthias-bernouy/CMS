import { randomUUID } from "node:crypto";
import { writeImmutableIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationCompatibilityAdmissionReport } from "../../../../interfaces/compatibility";
import type {
    IntegrationRegistryPublicationRequest,
    IntegrationRegistryPublisher,
} from "../../../../interfaces/publication";
import { ensureFsIntegrationRegistryLayout, ensurePublicationPaths } from "../persistence/layout";
import { removeImmutableTreeIfExists } from "../persistence/tree";
import { prepareFsIntegrationRegistryCandidate } from "./candidate";
import { commitFsIntegrationRegistryPublication } from "./transaction/commit";
import {
    FsIntegrationRegistryRecoveryRequiredError,
    FsIntegrationRegistrySimulatedCrashError,
    type FsIntegrationRegistryPublisherConfig,
} from "./types";

export class FsIntegrationRegistryPublisher implements IntegrationRegistryPublisher {
    constructor(private readonly config: FsIntegrationRegistryPublisherConfig) {}

    async publish(request: IntegrationRegistryPublicationRequest) {
        const candidate = await prepareFsIntegrationRegistryCandidate(request.package, this.config.packageLimits);
        return publishPreparedFsIntegrationRegistryCandidate(this.config, candidate, request.schemaDeclarationEvidence);
    }
}

export async function publishPreparedFsIntegrationRegistryCandidate(
    config: FsIntegrationRegistryPublisherConfig,
    candidate: Awaited<ReturnType<typeof prepareFsIntegrationRegistryCandidate>>,
    schemaDeclarationEvidence?: IntegrationRegistryPublicationRequest["schemaDeclarationEvidence"],
    admissionReport?: IntegrationCompatibilityAdmissionReport,
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
        return await config.mutations.runExclusive(
            candidate.definition.kind,
            async () =>
                await commitFsIntegrationRegistryPublication({
                    config,
                    layout,
                    paths,
                    operationId,
                    candidate,
                    ...(schemaDeclarationEvidence ? { schemaDeclarationEvidence } : {}),
                    ...(admissionReport ? { admissionReport } : {}),
                }),
        );
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
