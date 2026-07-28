import type {
    CanonicalFile,
    CanonicalFileSet,
    CanonicalFileSetValidationOptions,
} from "@bernouy/cms-integration-packages";
import type { VerificationRunnerRequirement } from "../runner";

export const INTEGRATION_VERIFICATION_SCHEMA = "cms.integration.verification.v1" as const;
export const INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER = "@bernouy/cms-integration-verification/sdk/v1" as const;
export const INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA = "cms.integration.verification-suite-content.v2" as const;

export type IntegrationVerificationAuthorSuiteType = "contract" | "conformance";

export type IntegrationVerificationContractSuiteV1 = Readonly<{
    contractId: string;
    entrypoint: string;
    activeMajorRange: string;
}>;

export type IntegrationVerificationConformanceSuiteV1 = Readonly<{
    suiteId: string;
    entrypoint: string;
}>;

export type IntegrationVerificationSuiteContentV2 = Readonly<{
    schema: typeof INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA;
    type: IntegrationVerificationAuthorSuiteType;
    suite: IntegrationVerificationContractSuiteV1 | IntegrationVerificationConformanceSuiteV1;
    sources: readonly Readonly<{ path: string; file: CanonicalFile }>[];
    fixtures: readonly Readonly<{ path: string; file: CanonicalFile }>[];
}>;

export type BoundIntegrationVerificationAuthorSuiteV1 = Readonly<{
    suiteId: string;
    source: "author-contract" | "author-conformance";
    contentDigest: string;
    content: IntegrationVerificationSuiteContentV2;
}>;

export type IntegrationVerificationManifestV1 = Readonly<{
    runnerRequirements: readonly VerificationRunnerRequirement[];
    contracts: readonly IntegrationVerificationContractSuiteV1[];
    conformance: readonly IntegrationVerificationConformanceSuiteV1[];
    fixtures: readonly string[];
    /** Optional author fixtures for the repository-owned behavioral RLS suite. */
    behavioralRls?: string;
}>;

export type IntegrationVerificationEnvelopeV1 = Readonly<{
    schema: typeof INTEGRATION_VERIFICATION_SCHEMA;
    target: Readonly<{
        kind: string;
        version: string;
        packageDigest: string;
    }>;
    manifest: IntegrationVerificationManifestV1;
    files: CanonicalFileSet;
}>;

export type IntegrationVerificationValidationOptions = CanonicalFileSetValidationOptions;
