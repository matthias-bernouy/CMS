import type { PlatformVerificationSuiteApplicabilityV1 } from "./policy";

export const PLATFORM_VERIFICATION_SUITE_DEFINITION_SCHEMA = "cms.integration.platform-verification-suite.v1" as const;
export const PLATFORM_VERIFICATION_EVIDENCE_SCHEMA = "cms.integration.platform-verification-evidence.v1" as const;

export type PlatformVerificationSuiteDefinitionV1 = Readonly<{
    schema: typeof PLATFORM_VERIFICATION_SUITE_DEFINITION_SCHEMA;
    suiteId: string;
    applicability: PlatformVerificationSuiteApplicabilityV1;
    checks: readonly string[];
    claims: readonly string[];
    excludedClaims: readonly string[];
}>;

export type PlatformVerificationFindingV1 = Readonly<{
    code: string;
    path: string;
}>;

export type PlatformVerificationCheckEvidenceV1 = Readonly<{
    checkId: string;
    outcome: "passed" | "failed" | "not-applicable";
    subjectCount: number;
    observationDigest: string;
    findings: readonly PlatformVerificationFindingV1[];
    findingsTruncated: boolean;
}>;

export type PlatformVerificationEvidenceV1 = Readonly<{
    schema: typeof PLATFORM_VERIFICATION_EVIDENCE_SCHEMA;
    suiteId: string;
    suiteDigest: string;
    applicability: PlatformVerificationSuiteApplicabilityV1;
    outcome: "passed" | "failed" | "not-applicable";
    checks: readonly PlatformVerificationCheckEvidenceV1[];
}>;
