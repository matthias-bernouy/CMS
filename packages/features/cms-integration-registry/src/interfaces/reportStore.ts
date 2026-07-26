import type {
    IntegrationCompatibilityAdmissionReport,
    IntegrationCompatibilityReport,
    IntegrationCompatibilityReportRevision,
} from "./compatibility";
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
    listForPackage(
        kind: string,
        version: string,
        packageDigest: string,
    ): Promise<readonly ReviewedSchemaBaselineHistory[]>;
    append(request: AppendReviewedSchemaBaselineRequest): Promise<ReviewedSchemaBaselineHistory>;
}
