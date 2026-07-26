import type {
    IntegrationCompatibilityAdmissionReport,
    IntegrationCompatibilityReport,
    IntegrationCompatibilityReportRevision,
} from "./compatibility";

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
