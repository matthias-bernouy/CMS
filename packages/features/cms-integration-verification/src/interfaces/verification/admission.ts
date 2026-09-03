import type { IntegrationMigrationPhase } from "@bernouy/cms-integrations";
import type { PinnedVerificationRunnerIdentity } from "../runner";
import type { AdmissionBehavioralRlsPlanBindingV1 } from "./behavioralRls";

export const RELEASE_VERIFICATION_PLAN_SCHEMA = "cms.integration.release-verification-plan.v1" as const;

export type ReleaseVerificationPlanBaselineV1 = Readonly<{
    version: string;
    packageDigest: string;
    resilienceKey: string;
}>;

export type ReleaseVerificationPlanFixtureV1 = Readonly<{
    name: string;
    from: string;
}>;

export type ReleaseVerificationPlanScenarioV1 =
    | Readonly<{ type: "fresh-install" }>
    | Readonly<{
          type: "upgrade";
          baseline: ReleaseVerificationPlanBaselineV1;
          fixtureName?: string;
      }>
    | Readonly<{
          type: "crash-recovery";
          baseline: ReleaseVerificationPlanBaselineV1;
          phase: IntegrationMigrationPhase;
          fixtureName?: string;
      }>;

export type ReleaseVerificationPlanV1 = Readonly<{
    schema: typeof RELEASE_VERIFICATION_PLAN_SCHEMA;
    baselines: readonly ReleaseVerificationPlanBaselineV1[];
    fixtures: readonly ReleaseVerificationPlanFixtureV1[];
    hasMigrations: boolean;
    scenarios: readonly ReleaseVerificationPlanScenarioV1[];
    nominalScenarioCount: number;
    resilienceScenarioCount: number;
    distinctMigrationStateCount: number;
}>;

export type IdentifiedReleaseVerificationPlanV1 = Readonly<{
    plan: ReleaseVerificationPlanV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;

export type AdmissionReleaseVerificationPlanBindingV1 = Readonly<{
    digest: string;
    plan: ReleaseVerificationPlanV1;
}>;

export const ADMISSION_INPUT_SNAPSHOT_SCHEMA = "cms.integration.admission-input.v1" as const;

export type AdmissionReviewedBaselineReferenceV1 = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    connectorKey: string;
    lineageId: string;
    revisionId: string;
    baselineDigest: string;
    observedSchemaDigest: string;
}>;

export type AdmissionDependencyReferenceV1 = Readonly<{
    /** Missing only on admission snapshots written before the two-point matrix was introduced. */
    selection?: "minimum" | "stable";
    kind: string;
    version: string;
    packageDigest: string;
}>;

export type AdmissionActiveContractReferenceV1 = Readonly<{
    contractId: string;
    lineageId: string;
    ownerVersion: string;
    contractDigest: string;
}>;

export type AdmissionSuitePlanEntryV1 = Readonly<{
    suiteId: string;
    source: "platform" | "author-contract" | "author-conformance";
    contentDigest: string;
    /** Explicit only for policy-generated suites with an applicability rule. */
    applicable?: boolean;
}>;

export type AdmissionInputSnapshotV1 = Readonly<{
    schema: typeof ADMISSION_INPUT_SNAPSHOT_SCHEMA;
    candidate: Readonly<{
        candidateId: string;
        candidateDigest: string;
        kind: string;
        version: string;
        packageDigest: string;
        verificationDigest: string;
    }>;
    policyDigest: string;
    selectedRunner: PinnedVerificationRunnerIdentity;
    reviewedBaselines: readonly AdmissionReviewedBaselineReferenceV1[];
    dependencies: readonly AdmissionDependencyReferenceV1[];
    activeContracts: readonly AdmissionActiveContractReferenceV1[];
    suites: readonly AdmissionSuitePlanEntryV1[];
    /** Missing only from admissions created before behavioral RLS planning. */
    behavioralRlsPlan?: AdmissionBehavioralRlsPlanBindingV1;
    /** Server-owned exact upgrade matrix; absent from admissions predating runtime upgrade planning. */
    releaseVerificationPlan?: AdmissionReleaseVerificationPlanBindingV1;
    catalogRevision: Readonly<{
        revisionId: string;
        digest: string;
    }>;
    compatibilityRevision: Readonly<{
        revisionId: string;
        digest: string;
        evaluatorInputDigest: string;
    }>;
}>;

export type IdentifiedAdmissionInputSnapshotV1 = Readonly<{
    snapshot: AdmissionInputSnapshotV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;
