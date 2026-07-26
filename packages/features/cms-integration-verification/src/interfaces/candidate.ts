import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { IntegrationVerificationEnvelopeV1 } from "./verification";

export const INTEGRATION_CANDIDATE_SCHEMA = "cms.integration.candidate.v1" as const;

export type IntegrationCandidateEnvelopeV1 = Readonly<{
    schema: typeof INTEGRATION_CANDIDATE_SCHEMA;
    package: IntegrationPackageEnvelopeV1;
    verification: IntegrationVerificationEnvelopeV1;
    submission: Readonly<{
        requestedChannel?: "latest";
    }>;
}>;

export type ValidatedIntegrationCandidateEnvelopeV1 = Readonly<{
    envelope: IntegrationCandidateEnvelopeV1;
    packageDigest: string;
    verificationDigest: string;
}>;
