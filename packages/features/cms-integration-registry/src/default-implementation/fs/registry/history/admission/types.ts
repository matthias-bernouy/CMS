import type { ReleaseAdmissionPolicySnapshotV1, ReportProvenance } from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCatalogSnapshotProvider } from "../../../../../interfaces/catalog";
import type { IntegrationRegistryVersionEligibilityManager } from "../../../../../interfaces/promotion";
import type {
    IntegrationCompatibilityV2ReportStore,
    IntegrationMigrationReportStore,
    IntegrationVerificationReportStore,
    ReleaseAdmissionDecisionStore,
    ReleaseReportHistory,
    ReviewedSchemaBaselineStore,
} from "../../../../../interfaces/reportStore";
import type { ReleaseAdmissionDecision } from "@bernouy/cms-integration-verification";

export type FsReleaseAdmissionReconcilerConfig = Readonly<{
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    compatibility: IntegrationCompatibilityV2ReportStore;
    verification: IntegrationVerificationReportStore;
    migrations: IntegrationMigrationReportStore;
    decisions: ReleaseAdmissionDecisionStore;
    eligibility: IntegrationRegistryVersionEligibilityManager;
    statefulChanges?: Readonly<{
        policy: ReleaseAdmissionPolicySnapshotV1;
        reviewedSchemaBaselines: ReviewedSchemaBaselineStore;
    }>;
}>;

export type ReleaseAdmissionReconciliationResult = Readonly<{
    decision: ReleaseReportHistory<ReleaseAdmissionDecision>;
    decisionChanged: boolean;
    eligibilityChanged: boolean;
}>;

export type ReleaseAdmissionReconciliationProvenance = ReportProvenance;
