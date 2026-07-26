import type { IntegrationVerificationEnvelopeV1 } from "@bernouy/cms-integration-verification";
import type { VerificationPolicyIdentity, VerificationRunnerRequirement } from "@bernouy/cms-integration-verification";

export const OFFICIAL_VERIFICATION_BACKFILL_SCHEMA = "cms.integration.official-verification-backfill.v1" as const;
export const OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH = ".registry/verification/official-backfill.v1.json" as const;

export const OFFICIAL_INTEGRATION_VERIFICATION_POLICY: VerificationPolicyIdentity = Object.freeze({
    name: "official-integration-verification",
    version: "1.0.0",
});

export const OFFICIAL_INTEGRATION_VERIFICATION_RUNNER_REQUIREMENT: VerificationRunnerRequirement = Object.freeze({
    name: "cms-integration-verifier",
    versionRange: "1.0.0",
});

export type OfficialVerificationBackfillIndexEntry = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
}>;

export type OfficialVerificationBackfillIndexV1 = Readonly<{
    schema: typeof OFFICIAL_VERIFICATION_BACKFILL_SCHEMA;
    verificationPolicy: VerificationPolicyIdentity;
    entries: readonly OfficialVerificationBackfillIndexEntry[];
}>;

export type BuiltOfficialIntegrationVerification = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
    envelope: IntegrationVerificationEnvelopeV1;
    canonicalBytes: Uint8Array;
}>;

export type OfficialIntegrationVerificationBackfill = Readonly<{
    index: OfficialVerificationBackfillIndexV1;
    indexDigest: string;
    indexCanonicalBytes: Uint8Array;
    verifications: readonly BuiltOfficialIntegrationVerification[];
}>;
