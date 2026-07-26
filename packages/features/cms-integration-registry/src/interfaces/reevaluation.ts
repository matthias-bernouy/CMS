import type { IntegrationCompatibilityReportCollection } from "./reportStore";
import type { IntegrationCompatibilityReportRevision } from "./compatibility";
import type { IntegrationRegistryVersionEligibilityDecisionReference } from "./promotion";

export type IntegrationCompatibilityReevaluationRequest = Readonly<{
    kind: string;
    version: string;
    currentReportRevisionId: string;
    currentDecision?: IntegrationRegistryVersionEligibilityDecisionReference;
    actor: string;
    reason: string;
    evidenceIds?: readonly string[];
}>;

export type IntegrationCompatibilityReevaluationResult = Readonly<{
    revision: IntegrationCompatibilityReportRevision;
    history: IntegrationCompatibilityReportCollection;
    release?: Readonly<{
        compatibilityReportRevisionId: string;
        decision: IntegrationRegistryVersionEligibilityDecisionReference;
        admissible: boolean;
        eligibilityChanged: boolean;
    }>;
}>;

export interface IntegrationCompatibilityReevaluator {
    reevaluate(
        request: IntegrationCompatibilityReevaluationRequest,
    ): Promise<IntegrationCompatibilityReevaluationResult>;
}
