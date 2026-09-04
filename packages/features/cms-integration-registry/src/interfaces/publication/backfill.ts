import type {
    CompatibilityReportV2,
    IntegrationVerificationEnvelopeV1,
    ReleaseAdmissionDecision,
    StatefulChangeSelectionV1,
    VerificationReport,
} from "@bernouy/cms-integration-verification";

export const INTEGRATION_VERIFICATION_BACKFILL_SCHEMA = "cms.integration.verification-backfill-request.v1" as const;

export type IntegrationVerificationBackfillRequest = Readonly<{
    schema: typeof INTEGRATION_VERIFICATION_BACKFILL_SCHEMA;
    verification: Readonly<{
        digest: string;
        envelope: IntegrationVerificationEnvelopeV1;
    }>;
    compatibilityReport: CompatibilityReportV2;
    verificationReport: VerificationReport;
    statefulChanges: StatefulChangeSelectionV1;
    decision: ReleaseAdmissionDecision;
}>;

export type IdentifiedIntegrationVerificationBackfillRequest = Readonly<{
    request: IntegrationVerificationBackfillRequest;
    canonicalBytes: Uint8Array;
    digest: string;
    compatibilityReportDigest: string;
    verificationReportDigest: string;
    decisionDigest: string;
}>;

export type IntegrationVerificationBackfillResult = Readonly<{
    operationId: string;
    outcome: "backfilled" | "unchanged";
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
    decisionRevisionId: string;
    decisionDigest: string;
}>;

export interface IntegrationVerificationBackfiller {
    backfill(request: IntegrationVerificationBackfillRequest): Promise<IntegrationVerificationBackfillResult>;
}

export type PreparedIntegrationVerificationBackfill = Readonly<{
    verification: Readonly<{
        envelope: IntegrationVerificationEnvelopeV1;
        canonicalBytes: Uint8Array;
        digest: string;
    }>;
    compatibilityReport: CompatibilityReportV2;
    verificationReport: VerificationReport;
    statefulChanges: StatefulChangeSelectionV1;
    decision: ReleaseAdmissionDecision;
}>;
