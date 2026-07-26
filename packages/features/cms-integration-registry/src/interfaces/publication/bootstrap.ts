import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type {
    PinnedVerificationRunnerIdentity,
    ReviewedSchemaBaselineV1,
    VerificationPolicyIdentity,
} from "@bernouy/cms-integration-verification";

export const OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA = "cms.integration.official-bootstrap-plan.v1" as const;

export type OfficialBootstrapAnonymousConstraintFinding = Readonly<{
    path: string;
    line: number;
    column: number;
    kind: "anonymous-check" | "anonymous-unique";
}>;

export type OfficialBootstrapAnonymousConstraintGrandfathering = Readonly<{
    packageDigest: string;
    path: string;
    findings: readonly OfficialBootstrapAnonymousConstraintFinding[];
}>;

export type PreparedOfficialIntegrationPackage = Readonly<{
    package: ResolvedIntegrationPackage;
    anonymousConstraintGrandfathering: readonly OfficialBootstrapAnonymousConstraintGrandfathering[];
}>;

export type OfficialRepositoryBootstrapPlan = Readonly<{
    schema: typeof OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA;
    packages: readonly PreparedOfficialIntegrationPackage[];
    reviewedSchemaBaselines: readonly ReviewedSchemaBaselineV1[];
}>;

export type OfficialRepositoryBootstrapProjectedPackage = Readonly<{
    package: Readonly<{
        digest: string;
        envelope: ResolvedIntegrationPackage["envelope"];
    }>;
    anonymousConstraintGrandfathering: readonly OfficialBootstrapAnonymousConstraintGrandfathering[];
}>;

/** Canonical, byte-free representation used as the durable bootstrap identity. */
export type OfficialRepositoryBootstrapPlanProjection = Readonly<{
    schema: typeof OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA;
    packages: readonly OfficialRepositoryBootstrapProjectedPackage[];
    reviewedSchemaBaselines: readonly ReviewedSchemaBaselineV1[];
}>;

export type IdentifiedOfficialRepositoryBootstrapPlan = Readonly<{
    plan: OfficialRepositoryBootstrapPlanProjection;
    canonicalBytes: Uint8Array;
    digest: string;
}>;

export type OfficialRepositoryBootstrapBaselineApproval = Readonly<{
    generator: PinnedVerificationRunnerIdentity;
    environments: readonly Readonly<{ digest: string; postgresVersion: string }>[];
    policy: VerificationPolicyIdentity;
    provenanceActors: readonly string[];
}>;
