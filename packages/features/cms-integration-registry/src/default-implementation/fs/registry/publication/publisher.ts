import { randomUUID } from "node:crypto";
import { writeImmutableIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import type {
    IntegrationRegistryPublicationRequest,
    IntegrationRegistryPublisher,
} from "../../../../interfaces/publication";
import { ensureFsIntegrationRegistryLayout, ensurePublicationPaths } from "../persistence/layout";
import { removeImmutableTreeIfExists } from "../persistence/tree";
import { prepareFsIntegrationRegistryCandidate } from "./candidate";
import { IntegrationRegistryKindLock } from "./lock";
import { commitFsIntegrationRegistryPublication } from "./transaction/commit";
import {
    FsIntegrationRegistryRecoveryRequiredError,
    FsIntegrationRegistrySimulatedCrashError,
    type FsIntegrationRegistryPublisherConfig,
} from "./types";

export class FsIntegrationRegistryPublisher implements IntegrationRegistryPublisher {
    private readonly kindLock = new IntegrationRegistryKindLock();

    constructor(private readonly config: FsIntegrationRegistryPublisherConfig) {}

    async publish(request: IntegrationRegistryPublicationRequest) {
        const candidate = await prepareFsIntegrationRegistryCandidate(request.package, this.config.packageLimits);
        const operationId = this.config.createOperationId?.() ?? randomUUID();
        const layout = await ensureFsIntegrationRegistryLayout(this.config.root);
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
            return await this.kindLock.run(
                candidate.definition.kind,
                async () =>
                    await commitFsIntegrationRegistryPublication({
                        config: this.config,
                        layout,
                        paths,
                        operationId,
                        candidate,
                        ...(request.schemaDeclarationEvidence
                            ? { schemaDeclarationEvidence: request.schemaDeclarationEvidence }
                            : {}),
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
}
