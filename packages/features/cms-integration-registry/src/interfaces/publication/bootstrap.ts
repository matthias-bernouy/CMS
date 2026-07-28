import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type {
    CompatibilityReportV2,
    IntegrationVerificationEnvelopeV1,
    PinnedVerificationRunnerIdentity,
    ReleaseAdmissionDecision,
    ReviewedSchemaBaselineV1,
    StatefulChangeSelectionV1,
    VerificationPolicyIdentity,
    VerificationReport,
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

export type PreparedOfficialVerificationBackfill = Readonly<{
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

export type OfficialRepositoryBootstrapPlan = Readonly<{
    schema: typeof OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA;
    packages: readonly PreparedOfficialIntegrationPackage[];
    reviewedSchemaBaselines: readonly ReviewedSchemaBaselineV1[];
    verificationBackfills: readonly PreparedOfficialVerificationBackfill[];
}>;

export type OfficialRepositoryBootstrapProjectedPackage = Readonly<{
    package: Readonly<{
        digest: string;
        envelope: ResolvedIntegrationPackage["envelope"];
    }>;
    anonymousConstraintGrandfathering: readonly OfficialBootstrapAnonymousConstraintGrandfathering[];
}>;

export type OfficialRepositoryBootstrapProjectedVerificationBackfill = Readonly<{
    verification: Readonly<{
        envelope: IntegrationVerificationEnvelopeV1;
        digest: string;
    }>;
    compatibilityReport: CompatibilityReportV2;
    verificationReport: VerificationReport;
    statefulChanges: StatefulChangeSelectionV1;
    decision: ReleaseAdmissionDecision;
    transition: Readonly<{
        schema: "cms.integration.official-bootstrap-transition.v1";
        kind: string;
        version: string;
        packageDigest: string;
        verificationDigest: string;
        finalDecisionDigest: string;
        behavior: "installable-until-exact-decision-committed";
    }>;
}>;

/** Canonical, byte-free representation used as the durable bootstrap identity. */
export type OfficialRepositoryBootstrapPlanProjection = Readonly<{
    schema: typeof OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA;
    packages: readonly OfficialRepositoryBootstrapProjectedPackage[];
    reviewedSchemaBaselines: readonly ReviewedSchemaBaselineV1[];
    verificationBackfills: readonly OfficialRepositoryBootstrapProjectedVerificationBackfill[];
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
