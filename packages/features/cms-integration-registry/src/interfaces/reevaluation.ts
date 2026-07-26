import type { IntegrationCompatibilityReportCollection } from "./reportStore";
import type { IntegrationCompatibilityReportRevision } from "./compatibility";

export type IntegrationCompatibilityReevaluationRequest = Readonly<{
    kind: string;
    version: string;
    currentReportRevisionId: string;
    actor: string;
    reason: string;
    evidenceIds?: readonly string[];
}>;

export type IntegrationCompatibilityReevaluationResult = Readonly<{
    revision: IntegrationCompatibilityReportRevision;
    history: IntegrationCompatibilityReportCollection;
}>;

export interface IntegrationCompatibilityReevaluator {
    reevaluate(
        request: IntegrationCompatibilityReevaluationRequest,
    ): Promise<IntegrationCompatibilityReevaluationResult>;
}
