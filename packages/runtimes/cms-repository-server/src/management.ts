import { randomUUID } from "node:crypto";
import {
    InMemoryIntegrationRegistryMutationCoordinator,
    CurrentIntegrationRegistryReleaseEvidenceReader,
    IntegrationCompatibilityEvaluator,
    identifyIntegrationVerificationBackfillRequest,
    INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
    type IntegrationRegistryRecoveryResult,
    type IntegrationRegistryReleaseEvidenceReader,
    type IntegrationVerificationBundleStore,
    type OfficialRepositoryBootstrapBaselineApproval,
    type PreparedOfficialVerificationBackfill,
} from "@bernouy/cms-integration-registry";
import type {
    MigrationVerificationEnvironmentV1,
    ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import {
    FsIntegrationCompatibilityReevaluator,
    FsIntegrationCompatibilityReportStore,
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationRegistryCandidateAdmissionPlanner,
    FsIntegrationRegistryCandidateFinalizationError,
    FsIntegrationRegistryCandidateFinalizer,
    FsIntegrationRegistryCandidateStore,
    FsIntegrationRegistryPublisher,
    FsIntegrationRegistryRecoverer,
    FsIntegrationRegistryStablePromoter,
    FsIntegrationRegistryVersionEligibilityManager,
    SnapshotIntegrationPackageSource,
    FsIntegrationVerificationReportStore,
    FsIntegrationVerificationBundleStore,
    FsIntegrationVerificationBackfiller,
    FsReleaseAdmissionReconciler,
    FsReleaseAdmissionDecisionStore,
    FsReviewedSchemaBaselineStore,
    FsReviewedSchemaBaselineImporter,
    MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_DOCUMENT_BYTES,
    MAX_INTEGRATION_VERIFICATION_BACKFILL_DOCUMENT_BYTES,
    recoverIntegrationVerificationBackfills,
    recoverFsReleaseReportHistories,
    recoverReviewedSchemaBaselineImports,
    recoverVerifiedCandidateActivations,
    type ReviewedSchemaBaselineImportTarget,
} from "@bernouy/cms-integration-registry/fs";
import {
    mountRepositorySchemaBaselineImportRoutes,
    mountRepositoryVerificationBackfillRoutes,
    RepositoryManagementCms,
} from "@bernouy/cms-repository-management";
import type { RepositoryCompatibilityReader } from "@bernouy/cms-repository";
import type { Runner } from "@bernouy/http-runner";
import type { RepositoryCatalogRuntime } from "./core/catalogRuntime";
import {
    createProductionRepositoryCandidateProtocol,
    type ProductionRepositoryCandidateProtocolConfig,
} from "./core/candidates/composition";
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
    mountWorkerAuthenticated: RepositoryManagementSurfaceMount;
    mountWorkerCapabilities: RepositoryManagementSurfaceMount;
    recovery: IntegrationRegistryRecoveryResult;
    candidateRecovery: Awaited<ReturnType<typeof createProductionRepositoryCandidateProtocol>>["recovery"];
    compatibility: RepositoryCompatibilityReader;
    releases: IntegrationRegistryReleaseEvidenceReader;
    verificationBundles: Pick<IntegrationVerificationBundleStore, "get">;
}>;

export async function createProductionRepositoryManagement(input: {
    root: string;
    catalog: RepositoryCatalogRuntime;
    telemetry?: RepositoryOperationalTelemetry;
    baselineImports?: Readonly<{
        approval: OfficialRepositoryBootstrapBaselineApproval;
        approvedTargets: readonly ReviewedSchemaBaselineImportTarget[];
    }>;
    verificationBackfills?: readonly PreparedOfficialVerificationBackfill[];
    candidateProtocol?: Omit<ProductionRepositoryCandidateProtocolConfig, "root">;
    candidateAdmissionPolicy?: ReleaseAdmissionPolicySnapshotV1;
    candidateMigrationEnvironment?: MigrationVerificationEnvironmentV1;
}): Promise<ProductionRepositoryManagement> {
    const telemetry = input.telemetry ?? new RepositoryOperationalTelemetry();
    const snapshots = input.catalog.snapshotReference();
    const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
    const reviewedSchemaBaselines = new FsReviewedSchemaBaselineStore({ root: input.root });
    const releaseReportConfig = { root: input.root, snapshots, mutations };
    const reports = new FsIntegrationCompatibilityReportStore({ snapshots, mutations });
    const compatibilityReports = new FsIntegrationCompatibilityV2ReportStore(releaseReportConfig);
    const verificationReports = new FsIntegrationVerificationReportStore(releaseReportConfig);
    const verificationBundles = new FsIntegrationVerificationBundleStore(input.root);
    const migrationReports = new FsIntegrationMigrationReportStore(releaseReportConfig);
    const releaseDecisions = new FsReleaseAdmissionDecisionStore({
        ...releaseReportConfig,
        compatibilityReports,
        verificationReports,
        migrationReports,
    });
    const versionEligibility = new FsIntegrationRegistryVersionEligibilityManager({
        root: input.root,
        snapshots,
        decisions: releaseDecisions,
        mutations,
    });
    const releaseAdmission = new FsReleaseAdmissionReconciler({
        snapshots,
        compatibility: compatibilityReports,
        verification: verificationReports,
        migrations: migrationReports,
        decisions: releaseDecisions,
        eligibility: versionEligibility,
        legacyCompatibility: reports,
        ...(input.candidateAdmissionPolicy
            ? {
                  statefulChanges: {
                      policy: input.candidateAdmissionPolicy,
                      reviewedSchemaBaselines,
                  },
              }
            : {}),
    });
    const releaseEvidence = new CurrentIntegrationRegistryReleaseEvidenceReader({
        catalog: snapshots,
        compatibility: compatibilityReports,
        verification: verificationReports,
        migrations: migrationReports,
        decisions: releaseDecisions,
    });
    const compatibility = new IntegrationCompatibilityEvaluator({
        identity: { name: "cms-repository-server", version: "1.0.0" },
        now: () => new Date().toISOString(),
        createReportId: () => randomUUID(),
    });
    const registryRecovery = await new FsIntegrationRegistryRecoverer({
        root: input.root,
        snapshots,
        releaseDecisions,
    }).recover();
    const releaseReportRecovery = await recoverFsReleaseReportHistories(input.root);
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
    const approvedVerificationBackfillRequests = await Promise.all(
        (input.verificationBackfills ?? []).map((entry) =>
            identifyIntegrationVerificationBackfillRequest({
                schema: INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
                verification: { envelope: entry.verification.envelope, digest: entry.verification.digest },
                compatibilityReport: entry.compatibilityReport,
                verificationReport: entry.verificationReport,
                statefulChanges: entry.statefulChanges,
                decision: entry.decision,
            }),
        ),
    );
    const verificationBackfillConfig = {
        root: input.root,
        snapshots,
        mutations,
        bundles: verificationBundles,
        compatibilityReports,
        verificationReports,
        decisions: releaseDecisions,
        reviewedSchemaBaselines,
        approvedRequestDigests: approvedVerificationBackfillRequests.map(({ digest }) => digest),
    };
    const verificationBackfiller = new FsIntegrationVerificationBackfiller(verificationBackfillConfig);
    const verificationBackfillDiagnostics = await recoverIntegrationVerificationBackfills(verificationBackfillConfig);
    const candidateStore = new FsIntegrationRegistryCandidateStore({ root: input.root });
    const candidatePlanner = input.candidateAdmissionPolicy
        ? new FsIntegrationRegistryCandidateAdmissionPlanner({
              snapshots,
              mutations,
              candidates: candidateStore,
              reviewedSchemaBaselines,
              policy: input.candidateAdmissionPolicy,
              ...(input.candidateMigrationEnvironment
                  ? { migrationEnvironment: input.candidateMigrationEnvironment }
                  : {}),
          })
        : undefined;
    const candidateFinalizerConfig = input.candidateAdmissionPolicy
        ? {
              root: input.root,
              snapshots,
              mutations,
              compatibility,
              reviewedSchemaBaselines,
              candidates: candidateStore,
              policy: input.candidateAdmissionPolicy,
              compatibilityReports,
              verificationReports,
              migrationReports,
              releaseDecisions,
              verificationBundles,
          }
        : undefined;
    const candidateFinalizer = candidateFinalizerConfig
        ? new FsIntegrationRegistryCandidateFinalizer(candidateFinalizerConfig)
        : undefined;
    const candidateProtocol = await createProductionRepositoryCandidateProtocol({
        root: input.root,
        ...input.candidateProtocol,
        store: candidateStore,
        packageSource: new SnapshotIntegrationPackageSource({ snapshots }),
        ...(candidatePlanner ? { plan: (request) => candidatePlanner.plan(request) } : {}),
        ...(candidateFinalizer
            ? {
                  publication: {
                      async finalize(candidateId: string) {
                          await candidateFinalizer.finalize(candidateId);
                          const current = await candidateStore.get(candidateId);
                          if (!current) {
                              throw new Error("Finalized candidate disappeared from its persistent store");
                          }
                          return current;
                      },
                  },
              }
            : {}),
    });
    if (candidateFinalizerConfig && candidateFinalizer) {
        await recoverVerifiedCandidateActivations(candidateFinalizerConfig);
        for (const candidate of await candidateStore.listPublicationPending()) {
            try {
                await candidateFinalizer.recover(candidate.candidateId);
            } catch (error) {
                if (
                    !(
                        error instanceof FsIntegrationRegistryCandidateFinalizationError &&
                        error.code === "admission_rejected"
                    )
                ) {
                    throw error;
                }
            }
        }
    }
    await releaseAdmission.reconcileAll({
        actor: "repository:recovery",
        reason: "Repair current composite release admission eligibility",
    });
    const recovery: IntegrationRegistryRecoveryResult = Object.freeze({
        snapshot: snapshots.current(),
        diagnostics: Object.freeze([
            ...registryRecovery.diagnostics,
            ...releaseReportRecovery.diagnostics.map((diagnostic) => ({
                code: "release-report-history-quarantined" as const,
                source: diagnostic.quarantinePath,
                message: `Quarantined invalid ${diagnostic.stream} release report history`,
            })),
            ...baselineImportDiagnostics,
            ...verificationBackfillDiagnostics,
        ]),
    });
    const publisher = new ObservedIntegrationRegistryPublisher(
        new FsIntegrationRegistryPublisher({
            root: input.root,
            snapshots,
            compatibility,
            mutations,
            reviewedSchemaBaselines,
            rawPublicationPolicy: "reject-unverified",
        }),
        telemetry,
    );
    const promoter = new ObservedIntegrationRegistryStablePromoter(
        new FsIntegrationRegistryStablePromoter({
            root: input.root,
            snapshots,
            decisions: releaseDecisions,
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
            release: {
                compatibility: compatibilityReports,
                decisions: releaseDecisions,
                reconciler: releaseAdmission,
            },
        }),
        telemetry,
    );
    return Object.freeze({
        recovery,
        candidateRecovery: candidateProtocol.recovery,
        compatibility: reports,
        releases: releaseEvidence,
        verificationBundles,
        mountMaintenance(runner: Runner) {
            if (baselineImporter) {
                mountRepositorySchemaBaselineImportRoutes(runner, {
                    importer: baselineImporter,
                    maxBodyBytes: MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_DOCUMENT_BYTES,
                });
            }
            mountRepositoryVerificationBackfillRoutes(runner, {
                backfiller: verificationBackfiller,
                maxBodyBytes: MAX_INTEGRATION_VERIFICATION_BACKFILL_DOCUMENT_BYTES,
            });
        },
        mountWorkerAuthenticated(runner: Runner) {
            candidateProtocol.mountWorkerAuthenticated(runner);
        },
        mountWorkerCapabilities(runner: Runner) {
            candidateProtocol.mountWorkerCapabilities(runner);
        },
        mount(runner: Runner) {
            new RepositoryManagementCms({
                runner,
                publisher,
                upload: { maxBodyBytes: MAX_PUBLICATION_UPLOAD_BYTES },
                reads: {
                    catalog: snapshots,
                    reports,
                    releases: releaseEvidence,
                    recoveryDiagnostics: () => recovery.diagnostics,
                    operational: {
                        snapshot: () => telemetry.snapshot(),
                        filesystemCapacity: () => readRepositoryFilesystemCapacity(input.root),
                    },
                },
                stablePromotions: { promoter, maxBodyBytes: MAX_MANAGEMENT_JSON_BYTES },
                versionEligibility: { manager: versionEligibility, maxBodyBytes: MAX_MANAGEMENT_JSON_BYTES },
                compatibilityReevaluations: { reevaluator, maxBodyBytes: MAX_MANAGEMENT_JSON_BYTES },
                existingVersionDigest(kind, version) {
                    return input.catalog.current().locateExactVersion(kind, version)?.package.digest ?? null;
                },
            });
            candidateProtocol.mountManagement(runner);
        },
    });
}
