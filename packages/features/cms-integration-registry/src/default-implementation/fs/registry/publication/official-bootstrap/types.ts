import type { IntegrationCompatibilityAdmissionReport } from "../../../../../interfaces/compatibility";
import type {
    OfficialRepositoryBootstrapBaselineApproval,
    OfficialRepositoryBootstrapPlanProjection,
} from "../../../../../interfaces/publication";
import type { ReviewedSchemaBaselineStore } from "../../../../../interfaces/reportStore";
import type {
    IntegrationCompatibilityV2ReportStore,
    IntegrationMigrationReportStore,
    IntegrationVerificationBundleStore,
    IntegrationVerificationReportStore,
    ReleaseAdmissionDecisionStore,
} from "../../../../../interfaces/reportStore";
import type { PreparedFsIntegrationRegistryCandidate } from "../candidate";
import type { FsIntegrationRegistryPublicationConfig } from "../types";

export const PREPARED_OFFICIAL_BOOTSTRAP_SCHEMA = "cms.integration.registry.prepared-official-bootstrap.v1" as const;

export type FsOfficialIntegrationRegistryBootstrapPublisherConfig = FsIntegrationRegistryPublicationConfig &
    Readonly<{
        baselineApproval: OfficialRepositoryBootstrapBaselineApproval;
        baselineStore?: ReviewedSchemaBaselineStore;
        verificationBundles?: IntegrationVerificationBundleStore;
        compatibilityV2Reports?: IntegrationCompatibilityV2ReportStore;
        verificationReports?: IntegrationVerificationReportStore;
        migrationReports?: IntegrationMigrationReportStore;
        releaseDecisions?: ReleaseAdmissionDecisionStore;
    }>;

export type PreparedFsOfficialIntegrationRegistryBootstrap = Readonly<{
    schema: typeof PREPARED_OFFICIAL_BOOTSTRAP_SCHEMA;
    planDigest: string;
    packageCount: number;
    pendingPackageCount: number;
    baselineCount: number;
    verificationBackfillCount: number;
    plan: OfficialRepositoryBootstrapPlanProjection;
}>;

export type PreflightedOfficialBootstrapPackage = Readonly<{
    candidate: PreparedFsIntegrationRegistryCandidate;
    verificationDigest: string;
    report?: IntegrationCompatibilityAdmissionReport;
}>;

export type PreflightedOfficialBootstrap = Readonly<{
    planDigest: string;
    plan: OfficialRepositoryBootstrapPlanProjection;
    packages: readonly PreflightedOfficialBootstrapPackage[];
}>;
