import type {
    IntegrationCompatibilityAdmissionReport,
    IntegrationCompatibilityReport,
    IntegrationCompatibilityReportRevision,
} from "./compatibility";
import type {
    CompatibilityReportV2,
    MigrationReport,
    ReleaseAdmissionDecision,
    VerificationReport,
} from "@bernouy/cms-integration-verification";
import type { ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";

export type IntegrationCompatibilityReportCollection = Readonly<{
    admission: IntegrationCompatibilityAdmissionReport;
    current: IntegrationCompatibilityReport;
    reports: readonly IntegrationCompatibilityReport[];
}>;

export type IntegrationCompatibilityReportPageRequest = Readonly<{
    after?: string;
    limit?: number;
}>;

export type IntegrationCompatibilityReportPage = Readonly<{
    admission: IntegrationCompatibilityAdmissionReport;
    current: IntegrationCompatibilityReport;
    revisions: readonly IntegrationCompatibilityReportRevision[];
    totalRevisions: number;
    nextCursor?: string;
}>;

export interface IntegrationCompatibilityReportStore {
    get(kind: string, version: string): Promise<IntegrationCompatibilityReportCollection | null>;
    list(
        kind: string,
        version: string,
        page?: IntegrationCompatibilityReportPageRequest,
    ): Promise<IntegrationCompatibilityReportPage | null>;
    appendRevision(revision: IntegrationCompatibilityReportRevision): Promise<IntegrationCompatibilityReportCollection>;
}

export type ReviewedSchemaBaselineLogicalKey = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    connectorKey: string;
    lineageId: string;
}>;

export type ReviewedSchemaBaselineHistory = Readonly<{
    logicalKey: ReviewedSchemaBaselineLogicalKey;
    currentRevisionId: string;
    currentBaselineDigest: string;
    current: ReviewedSchemaBaselineV1;
    revisions: readonly ReviewedSchemaBaselineV1[];
}>;

export type AppendReviewedSchemaBaselineRequest = Readonly<{
    baseline: ReviewedSchemaBaselineV1;
    expectedCurrentRevisionId: string | null;
}>;

export interface ReviewedSchemaBaselineStore {
    get(logicalKey: ReviewedSchemaBaselineLogicalKey): Promise<ReviewedSchemaBaselineHistory | null>;
    listAll(): Promise<readonly ReviewedSchemaBaselineHistory[]>;
    listForPackage(
        kind: string,
        version: string,
        packageDigest: string,
    ): Promise<readonly ReviewedSchemaBaselineHistory[]>;
    append(request: AppendReviewedSchemaBaselineRequest): Promise<ReviewedSchemaBaselineHistory>;
}

export const REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA = "cms.integration.reviewed-schema-baseline-import.v1" as const;

export type ReviewedSchemaBaselineImportCurrent = Readonly<{
    revisionId: string;
    baselineDigest: string;
}>;

export type ReviewedSchemaBaselineImportRequest = Readonly<{
    schema: typeof REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA;
    baselineDigest: string;
    baseline: ReviewedSchemaBaselineV1;
    expectedCurrent: ReviewedSchemaBaselineImportCurrent | null;
}>;

export type IdentifiedReviewedSchemaBaselineImportRequest = Readonly<{
    request: ReviewedSchemaBaselineImportRequest;
    canonicalBytes: Uint8Array;
    digest: string;
}>;

export type ReviewedSchemaBaselineImportResult = Readonly<{
    operationId: string;
    outcome: "imported" | "unchanged";
    kind: string;
    version: string;
    packageDigest: string;
    baselineDigest: string;
    currentRevisionId: string;
}>;

export interface ReviewedSchemaBaselineImporter {
    importBaseline(request: ReviewedSchemaBaselineImportRequest): Promise<ReviewedSchemaBaselineImportResult>;
}

export type ReleaseReportCurrentReference = Readonly<{
    revisionId: string;
    reportDigest: string;
}>;

export type ReleaseReportHistory<T> = Readonly<{
    currentRevisionId: string;
    currentReportDigest: string;
    current: T;
    revisions: readonly T[];
}>;

export type AppendReleaseReportRequest<T> = Readonly<{
    report: T;
    expectedCurrent: ReleaseReportCurrentReference | null;
}>;

export interface IntegrationCompatibilityV2ReportStore {
    get(kind: string, version: string): Promise<ReleaseReportHistory<CompatibilityReportV2> | null>;
    append(
        request: AppendReleaseReportRequest<CompatibilityReportV2>,
    ): Promise<ReleaseReportHistory<CompatibilityReportV2>>;
}

export interface IntegrationVerificationReportStore {
    get(kind: string, version: string): Promise<ReleaseReportHistory<VerificationReport> | null>;
    append(request: AppendReleaseReportRequest<VerificationReport>): Promise<ReleaseReportHistory<VerificationReport>>;
}

export type IntegrationMigrationReportLogicalKey = Readonly<{
    sourceKind: string;
    sourceVersion: string;
    sourcePackageDigest: string;
    targetKind: string;
    targetVersion: string;
    targetPackageDigest: string;
    connectorKey: string;
    lineageId: string;
    migrationRevision: number;
}>;

export interface IntegrationMigrationReportStore {
    get(key: IntegrationMigrationReportLogicalKey): Promise<ReleaseReportHistory<MigrationReport> | null>;
    append(request: AppendReleaseReportRequest<MigrationReport>): Promise<ReleaseReportHistory<MigrationReport>>;
}

export interface ReleaseAdmissionDecisionStore {
    getHistory(kind: string, version: string): Promise<ReleaseReportHistory<ReleaseAdmissionDecision> | null>;
    get(kind: string, version: string): Promise<ReleaseReportHistory<ReleaseAdmissionDecision> | null>;
    append(
        request: AppendReleaseReportRequest<ReleaseAdmissionDecision>,
    ): Promise<ReleaseReportHistory<ReleaseAdmissionDecision>>;
}

export type FsReleaseReportRecoveryDiagnostic = Readonly<{
    stream: "compatibility" | "verification" | "migration" | "decision";
    history: string;
    code: "invalid-history-quarantined";
    message: string;
    quarantinePath: string;
}>;

export type FsReleaseReportRecoveryResult = Readonly<{
    diagnostics: readonly FsReleaseReportRecoveryDiagnostic[];
}>;
