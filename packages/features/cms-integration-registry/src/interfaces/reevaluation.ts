import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import type { ReleaseReportCurrentReference, ReleaseReportHistory } from "./reportStore";
import type { IntegrationRegistryVersionEligibilityDecisionReference } from "./promotion";

export type IntegrationCompatibilityReevaluationRequest = Readonly<{
    kind: string;
    version: string;
    currentReport: ReleaseReportCurrentReference;
    currentDecision?: IntegrationRegistryVersionEligibilityDecisionReference;
    actor: string;
    reason: string;
    evidenceIds?: readonly string[];
}>;

export type IntegrationCompatibilityReevaluationResult = Readonly<{
    revision: CompatibilityReportV2;
    history: ReleaseReportHistory<CompatibilityReportV2>;
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
