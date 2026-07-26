import type { CanonicalFileSet, CanonicalFileSetValidationOptions } from "@bernouy/cms-integration-packages";
import type { VerificationRunnerRequirement } from "../runner";

export const INTEGRATION_VERIFICATION_SCHEMA = "cms.integration.verification.v1" as const;

export type IntegrationVerificationManifestV1 = Readonly<{
    runnerRequirements: readonly VerificationRunnerRequirement[];
    contracts: readonly Readonly<{
        contractId: string;
        entrypoint: string;
        activeMajorRange: string;
    }>[];
    conformance: readonly Readonly<{
        suiteId: string;
        entrypoint: string;
    }>[];
    fixtures: readonly string[];
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
