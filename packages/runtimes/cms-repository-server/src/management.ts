import { randomUUID } from "node:crypto";
import {
    InMemoryIntegrationRegistryMutationCoordinator,
    CurrentIntegrationRegistryReleaseEvidenceReader,
    PublishedIntegrationVerificationBundleReader,
    IntegrationCompatibilityEvaluator,
    identifyIntegrationVerificationBackfillRequest,
    INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
    type IntegrationRegistryRecoveryResult,
    type IntegrationRegistryReleaseEvidenceReader,
    type IntegrationVerificationBundleStore,
    type PreparedIntegrationVerificationBackfill,
    type ReviewedSchemaBaselineImportApproval,
} from "@bernouy/cms-integration-registry";
import type {
    MigrationVerificationEnvironmentV1,
    ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import {
    FsIntegrationCompatibilityReevaluator,
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationRegistryCandidateAdmissionPlanner,
    FsIntegrationRegistryCandidateAdmissionPlanningError,
    FsIntegrationRegistryCandidateFinalizationError,
    FsIntegrationRegistryCandidateFinalizer,
    FsIntegrationRegistryCandidateStore,
    FsIntegrationRegistryRecoverer,
    FsIntegrationRegistryStablePromoter,
    FsIntegrationRegistryVersionEligibilityManager,
    SnapshotIntegrationPackageSource,
    FsIntegrationVerificationReportStore,
    FsIntegrationVerificationBundleStore,
    FsIntegrationVerificationContractCatalog,
    FsIntegrationVerificationBackfiller,
    FsReleaseAdmissionReconciler,
    FsReleaseAdmissionDecisionStore,
    FsReviewedSchemaBaselineStore,
    loadReviewedConnectorSchemaBaselines,
    FsReviewedSchemaBaselineImporter,
    MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_DOCUMENT_BYTES,
    MAX_INTEGRATION_VERIFICATION_BACKFILL_DOCUMENT_BYTES,
    recoverIntegrationVerificationBackfills,
    recoverFsReleaseReportHistories,
    recoverReviewedSchemaBaselineImports,
    recoverVerifiedCandidateActivations,
    type ReviewedSchemaBaselineImportTarget,
    type CandidateAdmissionPlanningErrorCode,
} from "@bernouy/cms-integration-registry/fs";
import {
    mountRepositorySchemaBaselineImportRoutes,
    mountRepositoryVerificationBackfillRoutes,
    RepositoryCandidateAdmissionPlanningError,
    mountRepositoryManagementRoutes,
} from "@bernouy/cms-repository-management";
import type { RepositoryCompatibilityReader, RepositorySchemaBaselineReader } from "@bernouy/cms-repository";
import type { Runner } from "@bernouy/http-runner";
import type { RepositoryCatalogRuntime } from "./core/catalogRuntime";
import {
    createProductionRepositoryCandidateProtocol,
    type ProductionRepositoryCandidateProtocolConfig,
} from "./core/candidates/composition";
import { createRepositoryCandidateAuthorSuiteResolver } from "./core/candidates/authorSuites";
import { readRepositoryFilesystemCapacity } from "./core/filesystemCapacity";
import { ObservedIntegrationRegistryStablePromoter } from "./core/observability/promoter";
import { ObservedIntegrationCompatibilityReevaluator } from "./core/observability/reevaluator";
import { RepositoryOperationalTelemetry } from "./core/observability/telemetry";
import type { RepositoryManagementSurfaceMount } from "./core/repositoryServer";

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
    schemaBaselines: RepositorySchemaBaselineReader;
}>;

export async function createProductionRepositoryManagement(input: {
    root: string;
    catalog: RepositoryCatalogRuntime;
    telemetry?: RepositoryOperationalTelemetry;
    baselineImports?: Readonly<{
        approval: ReviewedSchemaBaselineImportApproval;
        approvedTargets: readonly ReviewedSchemaBaselineImportTarget[];
    }>;
    verificationBackfills?: readonly PreparedIntegrationVerificationBackfill[];
    candidateProtocol?: Omit<ProductionRepositoryCandidateProtocolConfig, "root">;
    candidateAdmissionPolicy?: ReleaseAdmissionPolicySnapshotV1;
    candidateMigrationEnvironment?: MigrationVerificationEnvironmentV1;
}): Promise<ProductionRepositoryManagement> {
    const telemetry = input.telemetry ?? new RepositoryOperationalTelemetry();
    const snapshots = input.catalog.snapshotReference();
    const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
    const reviewedSchemaBaselines = new FsReviewedSchemaBaselineStore({ root: input.root });
    const releaseReportConfig = { root: input.root, snapshots, mutations };
    const compatibilityReports = new FsIntegrationCompatibilityV2ReportStore(releaseReportConfig);
    const verificationReports = new FsIntegrationVerificationReportStore(releaseReportConfig);
    const verificationBundleStore = new FsIntegrationVerificationBundleStore(input.root);
    const verificationContracts = new FsIntegrationVerificationContractCatalog({
        root: input.root,
        snapshots,
        mutations,
        bundles: verificationBundleStore,
    });
    const verificationBundles = new PublishedIntegrationVerificationBundleReader({
        catalog: snapshots,
        bundles: verificationBundleStore,
    });
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
        bundles: verificationBundleStore,
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
              inheritedContracts: verificationContracts,
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
              reviewedSchemaBaselines,
              candidates: candidateStore,
              policy: input.candidateAdmissionPolicy,
              compatibilityReports,
              verificationReports,
              migrationReports,
              releaseDecisions,
              verificationBundles: verificationBundleStore,
              inheritedContracts: verificationContracts,
          }
        : undefined;
    const candidateFinalizer = candidateFinalizerConfig
        ? new FsIntegrationRegistryCandidateFinalizer(candidateFinalizerConfig)
        : undefined;
    const candidatePlan = candidatePlanner
        ? async (request: Parameters<FsIntegrationRegistryCandidateAdmissionPlanner["plan"]>[0]) => {
              try {
                  return await candidatePlanner.plan(request);
              } catch (error) {
                  if (isCandidateAdmissionPlanningError(error)) {
                      throw new RepositoryCandidateAdmissionPlanningError(error.code);
                  }
                  throw error;
              }
          }
        : undefined;
    const candidateProtocol = await createProductionRepositoryCandidateProtocol({
        root: input.root,
        ...input.candidateProtocol,
        store: candidateStore,
        packageSource: new SnapshotIntegrationPackageSource({ snapshots }),
        authorSuites: createRepositoryCandidateAuthorSuiteResolver(verificationContracts),
        ...(candidatePlan ? { plan: candidatePlan } : {}),
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
            reports: compatibilityReports,
            evaluator: compatibility,
            reviewedSchemaBaselines,
            release: {
                decisions: releaseDecisions,
                reconciler: releaseAdmission,
            },
        }),
        telemetry,
    );
    return Object.freeze({
        recovery,
        candidateRecovery: candidateProtocol.recovery,
        compatibility: compatibilityReports,
        releases: releaseEvidence,
        verificationBundles,
        schemaBaselines: {
            listForPackage: (kind, version, packageDigest) =>
                loadReviewedConnectorSchemaBaselines(reviewedSchemaBaselines, kind, version, packageDigest),
        },
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
            mountRepositoryManagementRoutes({
                runner,
                reads: {
                    catalog: snapshots,
                    reports: compatibilityReports,
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
            });
            candidateProtocol.mountManagement(runner);
        },
    });
}

const CANDIDATE_ADMISSION_PLANNING_ERROR_CODES = new Set<CandidateAdmissionPlanningErrorCode>([
    "candidate_not_validating",
    "catalog_changed",
    "dependency_cycle",
    "dependency_unavailable",
    "missing_migration_baseline",
    "migration_input_unavailable",
    "release_verification_plan_unavailable",
    "runner_unavailable",
    "suite_conflict",
]);

function isCandidateAdmissionPlanningError(
    error: unknown,
): error is FsIntegrationRegistryCandidateAdmissionPlanningError {
    if (error instanceof FsIntegrationRegistryCandidateAdmissionPlanningError) {
        return true;
    }
    if (!(error instanceof Error) || error.name !== "FsIntegrationRegistryCandidateAdmissionPlanningError") {
        return false;
    }
    const code = (error as Partial<FsIntegrationRegistryCandidateAdmissionPlanningError>).code;
    return (
        typeof code === "string" &&
        CANDIDATE_ADMISSION_PLANNING_ERROR_CODES.has(code as CandidateAdmissionPlanningErrorCode)
    );
}
