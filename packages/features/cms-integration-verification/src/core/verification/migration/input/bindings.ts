import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import type { MigrationVerificationInputV1 } from "../../../../interfaces/verification/migration";
import { identifyStatefulChangeSelection } from "../../../reports/decision/selection";
import { pinnedRunner } from "../../../runner";
import { strictRecord } from "../../../validation/structure";
import { sha256Digest } from "../../../validation/values";
import { identifyReleaseAdmissionPolicySnapshot } from "../../policy";
import { identifyCanonicalVerificationContract, samePinnedRunner } from "../../shared";
import { identifyMigrationVerificationEnvironment } from "../environment";
import { identifyMigrationVerificationPlan } from "../plan";
import { invalid } from "../shared";

export async function parseStatefulChanges(
    value: unknown,
    expected: Readonly<{
        source: MigrationVerificationInputV1["source"];
        target: MigrationVerificationInputV1["target"];
        connectorKey: string;
        lineageId: string;
    }>,
) {
    const input = strictRecord(value, "migrationVerificationInput.statefulChanges", ["digest", "selection"]);
    const identified = await identifyStatefulChangeSelection(input.selection);
    const digest = sha256Digest(input.digest, "migrationVerificationInput.statefulChanges.digest");
    if (digest !== identified.digest || !sameVersionReference(identified.selection.target, expected.target)) {
        invalid("migrationVerificationInput.statefulChanges", "must identify the exact target selection");
    }
    const matching = identified.selection.requiredMigrations.filter(
        (entry) =>
            sameVersionReference(entry.source, expected.source) &&
            entry.connectorKey === expected.connectorKey &&
            entry.lineageId === expected.lineageId,
    );
    if (matching.length !== 1) {
        invalid("migrationVerificationInput.statefulChanges", "must require this exact source connector once");
    }
    return { digest, selection: identified.selection };
}

export async function parsePolicy(value: unknown, expectedDigest: string) {
    const input = strictRecord(value, "migrationVerificationInput.policy", ["digest", "snapshot"]);
    const identified = await identifyReleaseAdmissionPolicySnapshot(input.snapshot);
    const digest = sha256Digest(input.digest, "migrationVerificationInput.policy.digest");
    if (digest !== identified.digest || digest !== expectedDigest) {
        invalid("migrationVerificationInput.policy", "must identify the stateful selection policy snapshot");
    }
    return { digest, snapshot: identified.snapshot };
}

export async function parseRunner(
    value: unknown,
    approved: MigrationVerificationInputV1["policy"]["snapshot"]["approvedRunners"],
) {
    const input = strictRecord(value, "migrationVerificationInput.runner", ["digest", "identity"]);
    const identity = pinnedRunner(input.identity, "migrationVerificationInput.runner.identity");
    const identified = await identifyCanonicalVerificationContract(identity);
    const digest = sha256Digest(input.digest, "migrationVerificationInput.runner.digest");
    if (digest !== identified.digest || !approved.some((entry) => samePinnedRunner(entry, identity))) {
        invalid("migrationVerificationInput.runner", "must identify one exact approved runner");
    }
    return { digest, identity };
}

export async function parseEnvironment(
    value: unknown,
    policy: MigrationVerificationInputV1["policy"]["snapshot"],
    runner: MigrationVerificationInputV1["runner"],
): Promise<MigrationVerificationInputV1["environment"]> {
    const input = strictRecord(value, "migrationVerificationInput.environment", ["digest", "manifest"]);
    const identified = await identifyMigrationVerificationEnvironment(input.manifest);
    const digest = sha256Digest(input.digest, "migrationVerificationInput.environment.digest");
    if (digest !== identified.digest) {
        invalid("migrationVerificationInput.environment", "digest does not identify the environment manifest");
    }
    if (
        identified.environment.runner.digest !== runner.digest ||
        !samePinnedRunner(identified.environment.runner.identity, runner.identity)
    ) {
        invalid("migrationVerificationInput.environment.runner", "must identify the selected runner");
    }
    if (
        identified.environment.policy.name !== policy.migrationPolicy.name ||
        identified.environment.policy.version !== policy.migrationPolicy.version
    ) {
        invalid("migrationVerificationInput.environment.policy", "must identify the migration policy");
    }
    if (!policy.migrationEvidence.approvedEnvironmentDigests?.includes(digest)) {
        invalid("migrationVerificationInput.environment.digest", "must be explicitly approved by policy");
    }
    return { digest, manifest: identified.environment };
}

export async function parsePlan(value: unknown, targetVersion: string, targetMigrationRevision: number) {
    const input = strictRecord(value, "migrationVerificationInput.migrationPlan", ["digest", "plan"]);
    const identified = await identifyMigrationVerificationPlan(input.plan, targetVersion, targetMigrationRevision);
    const digest = sha256Digest(input.digest, "migrationVerificationInput.migrationPlan.digest");
    if (digest !== identified.digest) {
        invalid("migrationVerificationInput.migrationPlan", "digest does not identify the canonical migration plan");
    }
    return { digest, plan: identified.plan };
}

export function assertSelectedSource(
    plan: MigrationVerificationInputV1["migrationPlan"]["plan"],
    source: MigrationVerificationInputV1["source"],
    sourceMigrationRevision: number,
): void {
    const matches = plan.supportedSources.filter(
        (entry) =>
            entry.migrationRevision === sourceMigrationRevision &&
            integrationVersionSatisfies(source.version, entry.range),
    );
    if (matches.length !== 1) {
        invalid(
            "migrationVerificationInput.migrationPlan.plan.supportedSources",
            "must select the source exactly once",
        );
    }
    const adoption = matches[0]?.legacyAdoption;
    if (
        adoption &&
        (adoption.definitionVersion !== source.version || adoption.packageDigest !== source.packageDigest)
    ) {
        invalid(
            "migrationVerificationInput.migrationPlan.plan.supportedSources",
            "legacy adoption must bind the source",
        );
    }
    if (adoption) {
        const expected = plan.install.coveredMigrations.filter(
            (migration) => migration.revision <= sourceMigrationRevision,
        );
        if (!sameMigrationReferences(adoption.coveredMigrations, expected)) {
            invalid(
                "migrationVerificationInput.migrationPlan.plan.supportedSources",
                "legacy adoption coveredMigrations must exactly match the source ledger prefix",
            );
        }
    }
}

function sameMigrationReferences(
    actual: MigrationVerificationInputV1["migrationPlan"]["plan"]["install"]["coveredMigrations"],
    expected: MigrationVerificationInputV1["migrationPlan"]["plan"]["install"]["coveredMigrations"],
): boolean {
    return (
        actual.length === expected.length &&
        actual.every((entry, index) => {
            const reference = expected[index];
            return (
                entry.id === reference?.id &&
                entry.checksum === reference.checksum &&
                entry.revision === reference.revision &&
                entry.introducedIn === reference.introducedIn
            );
        })
    );
}

export function assertPolicyIdentity(
    selected: Readonly<{ name: string; version: string }>,
    expected: Readonly<{ name: string; version: string }>,
): void {
    if (selected.name !== expected.name || selected.version !== expected.version) {
        invalid("migrationVerificationInput.statefulChanges.selection.selector", "must equal the migration policy");
    }
}

function sameVersionReference(
    left: MigrationVerificationInputV1["source"],
    right: MigrationVerificationInputV1["source"],
): boolean {
    return left.kind === right.kind && left.version === right.version && left.packageDigest === right.packageDigest;
}
