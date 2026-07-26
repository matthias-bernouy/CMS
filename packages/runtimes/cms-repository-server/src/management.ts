import { randomUUID } from "node:crypto";
import {
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
    type IntegrationRegistryRecoveryResult,
    type OfficialRepositoryBootstrapBaselineApproval,
} from "@bernouy/cms-integration-registry";
import {
    FsIntegrationCompatibilityReevaluator,
    FsIntegrationCompatibilityReportStore,
    FsIntegrationRegistryPublisher,
    FsIntegrationRegistryRecoverer,
    FsIntegrationRegistryStablePromoter,
    FsReviewedSchemaBaselineStore,
    FsReviewedSchemaBaselineImporter,
    MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_DOCUMENT_BYTES,
    recoverReviewedSchemaBaselineImports,
    type ReviewedSchemaBaselineImportTarget,
} from "@bernouy/cms-integration-registry/fs";
import { mountRepositorySchemaBaselineImportRoutes, RepositoryManagementCms } from "@bernouy/cms-repository-management";
import type { RepositoryCompatibilityReader } from "@bernouy/cms-repository";
import type { Runner } from "@bernouy/http-runner";
import type { RepositoryCatalogRuntime } from "./core/catalogRuntime";
import { readRepositoryFilesystemCapacity } from "./core/filesystemCapacity";
import { ObservedIntegrationRegistryStablePromoter } from "./core/observability/promoter";
import { ObservedIntegrationRegistryPublisher } from "./core/observability/publisher";
import { ObservedIntegrationCompatibilityReevaluator } from "./core/observability/reevaluator";
import { RepositoryOperationalTelemetry } from "./core/observability/telemetry";
import type { RepositoryManagementSurfaceMount } from "./core/repositoryServer";

const MAX_PUBLICATION_UPLOAD_BYTES = 32 * 1_024 * 1_024;
const MAX_MANAGEMENT_JSON_BYTES = 64 * 1_024;

export type ProductionRepositoryManagement = Readonly<{
    mount: RepositoryManagementSurfaceMount;
    mountMaintenance: RepositoryManagementSurfaceMount;
    recovery: IntegrationRegistryRecoveryResult;
    compatibility: RepositoryCompatibilityReader;
}>;

export async function createProductionRepositoryManagement(input: {
    root: string;
    catalog: RepositoryCatalogRuntime;
    telemetry?: RepositoryOperationalTelemetry;
    baselineImports?: Readonly<{
        approval: OfficialRepositoryBootstrapBaselineApproval;
        approvedTargets: readonly ReviewedSchemaBaselineImportTarget[];
    }>;
}): Promise<ProductionRepositoryManagement> {
    const telemetry = input.telemetry ?? new RepositoryOperationalTelemetry();
    const snapshots = input.catalog.snapshotReference();
    const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
    const reviewedSchemaBaselines = new FsReviewedSchemaBaselineStore({ root: input.root });
    const registryRecovery = await new FsIntegrationRegistryRecoverer({ root: input.root, snapshots }).recover();
    const baselineImportConfig = input.baselineImports
        ? {
              root: input.root,
              snapshots,
              store: reviewedSchemaBaselines,
              mutations,
              ...input.baselineImports,
          }
        : undefined;
    const baselineImporter = baselineImportConfig
        ? new FsReviewedSchemaBaselineImporter(baselineImportConfig)
        : undefined;
    const baselineImportDiagnostics = baselineImportConfig
        ? await recoverReviewedSchemaBaselineImports(baselineImportConfig)
        : [];
    const recovery: IntegrationRegistryRecoveryResult = Object.freeze({
        snapshot: registryRecovery.snapshot,
        diagnostics: Object.freeze([...registryRecovery.diagnostics, ...baselineImportDiagnostics]),
    });
    const reports = new FsIntegrationCompatibilityReportStore({ snapshots, mutations });
    const compatibility = new IntegrationCompatibilityEvaluator({
        identity: { name: "cms-repository-server", version: "1.0.0" },
        now: () => new Date().toISOString(),
        createReportId: () => randomUUID(),
    });
    const publisher = new ObservedIntegrationRegistryPublisher(
        new FsIntegrationRegistryPublisher({
            root: input.root,
            snapshots,
            compatibility,
            mutations,
            reviewedSchemaBaselines,
            rawPublicationPolicy: "publish-unverified",
        }),
        telemetry,
    );
    const promoter = new ObservedIntegrationRegistryStablePromoter(
        new FsIntegrationRegistryStablePromoter({
            root: input.root,
            snapshots,
            reports,
            mutations,
        }),
        telemetry,
    );
    const reevaluator = new ObservedIntegrationCompatibilityReevaluator(
        new FsIntegrationCompatibilityReevaluator({
            snapshots,
            reports,
            evaluator: compatibility,
            reviewedSchemaBaselines,
        }),
        telemetry,
    );

    return Object.freeze({
        recovery,
        compatibility: reports,
        mountMaintenance(runner: Runner) {
            if (baselineImporter) {
                mountRepositorySchemaBaselineImportRoutes(runner, {
                    importer: baselineImporter,
                    maxBodyBytes: MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_DOCUMENT_BYTES,
                });
            }
        },
        mount(runner: Runner) {
            new RepositoryManagementCms({
                runner,
                publisher,
                upload: { maxBodyBytes: MAX_PUBLICATION_UPLOAD_BYTES },
                reads: {
                    catalog: snapshots,
                    reports,
                    recoveryDiagnostics: () => recovery.diagnostics,
                    operational: {
                        snapshot: () => telemetry.snapshot(),
                        filesystemCapacity: () => readRepositoryFilesystemCapacity(input.root),
                    },
                },
                stablePromotions: { promoter, maxBodyBytes: MAX_MANAGEMENT_JSON_BYTES },
                compatibilityReevaluations: { reevaluator, maxBodyBytes: MAX_MANAGEMENT_JSON_BYTES },
                existingVersionDigest(kind, version) {
                    return input.catalog.current().locateExactVersion(kind, version)?.package.digest ?? null;
                },
            });
        },
    });
}
