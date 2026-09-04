import {
    parsePinnedVerificationRunnerIdentity,
    parseVerificationPolicyIdentity,
    type ReviewedSchemaBaselineV1,
} from "@bernouy/cms-integration-verification";
import type { ReviewedSchemaBaselineImportApproval } from "../../../../../../interfaces/publication";

export function assertBaselineImportApproval(approval: ReviewedSchemaBaselineImportApproval): void {
    const generator = parsePinnedVerificationRunnerIdentity(approval.generator);
    const policy = parseVerificationPolicyIdentity(approval.policy, "baselineApproval.policy");
    const environments = approval.environments;
    const actors = approval.provenanceActors;
    if (
        generator.name !== approval.generator.name ||
        generator.version !== approval.generator.version ||
        generator.imageDigest !== approval.generator.imageDigest ||
        policy.name !== approval.policy.name ||
        policy.version !== approval.policy.version ||
        environments.length === 0 ||
        new Set(environments.map(({ digest, postgresVersion }) => `${digest}\0${postgresVersion}`)).size !==
            environments.length ||
        environments.some(
            ({ digest, postgresVersion }) =>
                !/^[a-f0-9]{64}$/u.test(digest) ||
                !postgresVersion ||
                postgresVersion.length > 128 ||
                postgresVersion.trim() !== postgresVersion,
        ) ||
        actors.length === 0 ||
        new Set(actors).size !== actors.length ||
        actors.some((actor) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(actor))
    ) {
        throw new TypeError("Reviewed schema baseline import approval policy is invalid");
    }
}

export function assertApprovedReviewedSchemaBaseline(
    baseline: ReviewedSchemaBaselineV1,
    target: Readonly<{ version: string; packageDigest: string }>,
    approval: ReviewedSchemaBaselineImportApproval,
): void {
    if (
        baseline.version !== target.version ||
        baseline.packageDigest !== target.packageDigest ||
        baseline.generator.name !== approval.generator.name ||
        baseline.generator.version !== approval.generator.version ||
        baseline.generator.imageDigest !== approval.generator.imageDigest ||
        !approval.environments.some(
            (environment) =>
                environment.digest === baseline.environment.digest &&
                environment.postgresVersion === baseline.environment.postgresVersion,
        ) ||
        baseline.policy.name !== approval.policy.name ||
        baseline.policy.version !== approval.policy.version ||
        !approval.provenanceActors.includes(baseline.provenance.actor) ||
        baseline.origin !== "legacy-backfill"
    ) {
        throw new TypeError("Reviewed schema baseline provenance or package identity is not approved");
    }
}
