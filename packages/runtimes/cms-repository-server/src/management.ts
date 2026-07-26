import { randomUUID } from "node:crypto";
import {
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
    type IntegrationRegistryRecoveryResult,
} from "@bernouy/cms-integration-registry";
import {
    FsIntegrationCompatibilityReportStore,
    FsIntegrationRegistryPublisher,
    FsIntegrationRegistryRecoverer,
    FsIntegrationRegistryStablePromoter,
} from "@bernouy/cms-integration-registry/fs";
import { RepositoryManagementCms } from "@bernouy/cms-repository-management";
import type { Runner } from "@bernouy/http-runner";
import type { RepositoryCatalogRuntime } from "./core/catalogRuntime";
import type { RepositoryManagementSurfaceMount } from "./core/repositoryServer";

const MAX_PUBLICATION_UPLOAD_BYTES = 32 * 1_024 * 1_024;
const MAX_MANAGEMENT_JSON_BYTES = 64 * 1_024;

export type ProductionRepositoryManagement = Readonly<{
    mount: RepositoryManagementSurfaceMount;
    recovery: IntegrationRegistryRecoveryResult;
}>;

export async function createProductionRepositoryManagement(input: {
    root: string;
    catalog: RepositoryCatalogRuntime;
}): Promise<ProductionRepositoryManagement> {
    const snapshots = input.catalog.snapshotReference();
    const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
    const recovery = await new FsIntegrationRegistryRecoverer({ root: input.root, snapshots }).recover();
    const reports = new FsIntegrationCompatibilityReportStore({ snapshots, mutations });
    const compatibility = new IntegrationCompatibilityEvaluator({
        identity: { name: "cms-repository-server", version: "1.0.0" },
        now: () => new Date().toISOString(),
        createReportId: () => randomUUID(),
    });
    const publisher = new FsIntegrationRegistryPublisher({
        root: input.root,
        snapshots,
        compatibility,
        mutations,
    });
    const promoter = new FsIntegrationRegistryStablePromoter({
        root: input.root,
        snapshots,
        reports,
        mutations,
    });

    return Object.freeze({
        recovery,
        mount(runner: Runner) {
            new RepositoryManagementCms({
                runner,
                publisher,
                upload: { maxBodyBytes: MAX_PUBLICATION_UPLOAD_BYTES },
                reads: {
                    catalog: snapshots,
                    reports,
                    recoveryDiagnostics: () => recovery.diagnostics,
                },
                stablePromotions: { promoter, maxBodyBytes: MAX_MANAGEMENT_JSON_BYTES },
                existingVersionDigest(kind, version) {
                    return input.catalog.current().locateExactVersion(kind, version)?.package.digest ?? null;
                },
            });
        },
    });
}
