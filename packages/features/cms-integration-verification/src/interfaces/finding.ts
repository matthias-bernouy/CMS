import type { VerificationPolicyIdentity } from "./runner";

export const FINDING_RESOLUTION_PROOF_SCHEMA = "cms.integration.finding-resolution-proof.v1" as const;

export type CompatibilityFindingSurface = "definition" | "input" | "dependency" | "artifact" | "schema" | "function";

export type CompatibilityFindingClassification = "compatible" | "additive" | "breaking" | "unknown" | "invalid";

export type CompatibilityFindingIdentityInput = Readonly<{
    surface: CompatibilityFindingSurface;
    path: string;
    code: string;
    baselineDigest: string;
    candidateDigest: string;
}>;

export type CompatibilityFindingInput = CompatibilityFindingIdentityInput &
    Readonly<{
        classification: CompatibilityFindingClassification;
        message: string;
    }>;

export type CompatibilityFinding = CompatibilityFindingInput &
    Readonly<{
        findingId: string;
    }>;

export type FindingResolutionProof = Readonly<{
    schema: typeof FINDING_RESOLUTION_PROOF_SCHEMA;
    findingId: string;
    outcome: "resolved-compatible" | "confirmed-breaking" | "invalid";
    proofType: string;
    producer: string;
    policy: VerificationPolicyIdentity & Readonly<{ applicableVersionRange: string }>;
    runnerDigest?: string;
    evidenceDigest: string;
    createdAt: string;
}>;
