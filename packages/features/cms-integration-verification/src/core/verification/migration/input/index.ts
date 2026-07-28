import { integrationVersionReleaseLevel } from "@bernouy/cms-integrations";
import type {
    IdentifiedMigrationVerificationInputV1,
    MigrationVerificationInputV1,
} from "../../../../interfaces/verification/migration";
import { MIGRATION_VERIFICATION_INPUT_SCHEMA } from "../../../../interfaces/verification/migration";
import { parseVersionDigestReference } from "../../../reports/shared";
import { assertContractIJson, strictRecord } from "../../../validation/structure";
import { nonNegativeInteger, stableIdentifier } from "../../../validation/values";
import { identifyCanonicalVerificationContract, parseVerificationControlDocument } from "../../shared";
import { invalid } from "../shared";
import {
    assertPolicyIdentity,
    assertSelectedSource,
    parseEnvironment,
    parsePlan,
    parsePolicy,
    parseRunner,
    parseStatefulChanges,
} from "./bindings";
import { parseDependencyMatrices } from "./dependencies";

const FIELDS = [
    "schema",
    "source",
    "target",
    "dependencyMatrices",
    "connectorKey",
    "lineageId",
    "sourceMigrationRevision",
    "targetMigrationRevision",
    "statefulChanges",
    "migrationPlan",
    "policy",
    "runner",
    "environment",
] as const;

export async function parseMigrationVerificationInput(
    input: string | Uint8Array,
): Promise<MigrationVerificationInputV1> {
    return await validateMigrationVerificationInput(parseVerificationControlDocument(input));
}

export async function validateMigrationVerificationInput(value: unknown): Promise<MigrationVerificationInputV1> {
    assertContractIJson(value);
    const input = strictRecord(value, "migrationVerificationInput", FIELDS);
    if (input.schema !== MIGRATION_VERIFICATION_INPUT_SCHEMA) {
        invalid("migrationVerificationInput.schema", `must be ${MIGRATION_VERIFICATION_INPUT_SCHEMA}`);
    }
    const source = parseVersionDigestReference(input.source, "migrationVerificationInput.source");
    const target = parseVersionDigestReference(input.target, "migrationVerificationInput.target");
    if (source.kind !== target.kind || !integrationVersionReleaseLevel(source.version, target.version)) {
        invalid("migrationVerificationInput.target", "must be a newer exact version of the source kind");
    }
    if (source.packageDigest === target.packageDigest) {
        invalid("migrationVerificationInput.target.packageDigest", "must differ from the source package digest");
    }
    const sourceMigrationRevision = nonNegativeInteger(
        input.sourceMigrationRevision,
        "migrationVerificationInput.sourceMigrationRevision",
    );
    const targetMigrationRevision = nonNegativeInteger(
        input.targetMigrationRevision,
        "migrationVerificationInput.targetMigrationRevision",
    );
    if (targetMigrationRevision <= sourceMigrationRevision) {
        invalid("migrationVerificationInput.targetMigrationRevision", "must advance sourceMigrationRevision");
    }
    const dependencyMatrices = parseDependencyMatrices(input.dependencyMatrices, target.kind);
    const connectorKey = stableIdentifier(input.connectorKey, "migrationVerificationInput.connectorKey");
    const lineageId = stableIdentifier(input.lineageId, "migrationVerificationInput.lineageId");
    const statefulChanges = await parseStatefulChanges(input.statefulChanges, {
        source,
        target,
        connectorKey,
        lineageId,
    });
    const policy = await parsePolicy(input.policy, statefulChanges.selection.policySnapshotDigest);
    assertPolicyIdentity(statefulChanges.selection.selector, policy.snapshot.migrationPolicy);
    const runner = await parseRunner(input.runner, policy.snapshot.approvedRunners);
    const environment = await parseEnvironment(input.environment, policy.snapshot, runner);
    const migrationPlan = await parsePlan(input.migrationPlan, target.version, targetMigrationRevision);
    assertSelectedSource(migrationPlan.plan, source, sourceMigrationRevision);
    return {
        schema: MIGRATION_VERIFICATION_INPUT_SCHEMA,
        source,
        target,
        dependencyMatrices,
        connectorKey,
        lineageId,
        sourceMigrationRevision,
        targetMigrationRevision,
        statefulChanges,
        migrationPlan,
        policy,
        runner,
        environment,
    };
}

export async function identifyMigrationVerificationInput(
    value: unknown,
): Promise<IdentifiedMigrationVerificationInputV1> {
    const input = await validateMigrationVerificationInput(value);
    const identified = await identifyCanonicalVerificationContract(input);
    return { input, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}
