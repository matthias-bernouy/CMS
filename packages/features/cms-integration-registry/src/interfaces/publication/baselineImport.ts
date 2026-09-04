import type {
    PinnedVerificationRunnerIdentity,
    VerificationPolicyIdentity,
} from "@bernouy/cms-integration-verification";

export type ReviewedSchemaBaselineImportApproval = Readonly<{
    generator: PinnedVerificationRunnerIdentity;
    environments: readonly Readonly<{ digest: string; postgresVersion: string }>[];
    policy: VerificationPolicyIdentity;
    provenanceActors: readonly string[];
}>;
