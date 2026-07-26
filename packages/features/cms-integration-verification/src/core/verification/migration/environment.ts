import type {
    IdentifiedMigrationVerificationEnvironmentV1,
    MigrationVerificationEnvironmentV1,
} from "../../../interfaces/verification/migration";
import { MIGRATION_VERIFICATION_ENVIRONMENT_SCHEMA } from "../../../interfaces/verification/migration";
import { pinnedRunner, parseVerificationPolicyIdentity } from "../../runner";
import { assertContractIJson, boundedArray, strictRecord } from "../../validation/structure";
import { imageDigest, oneOf, requiredText, sha256Digest, stableIdentifier } from "../../validation/values";
import { identifyCanonicalVerificationContract, parseVerificationControlDocument } from "../shared";
import { assertCanonicalUniqueOrder, canonicalIdentifiers, invalid, MAX_MIGRATION_OBSERVATIONS } from "./shared";

const OBJECT_TYPES = ["database", "schema", "table", "sequence", "function"] as const;

export async function parseMigrationVerificationEnvironment(
    input: string | Uint8Array,
): Promise<MigrationVerificationEnvironmentV1> {
    return await validateMigrationVerificationEnvironment(parseVerificationControlDocument(input));
}

export async function validateMigrationVerificationEnvironment(
    value: unknown,
): Promise<MigrationVerificationEnvironmentV1> {
    assertContractIJson(value);
    const input = strictRecord(value, "migrationEnvironment", [
        "schema",
        "postgres",
        "runner",
        "bootstrapSqlDigest",
        "roles",
        "grants",
        "extensions",
        "fixtures",
        "sessionSettings",
        "policy",
    ]);
    if (input.schema !== MIGRATION_VERIFICATION_ENVIRONMENT_SCHEMA) {
        invalid("migrationEnvironment.schema", `must be ${MIGRATION_VERIFICATION_ENVIRONMENT_SCHEMA}`);
    }
    const environment: MigrationVerificationEnvironmentV1 = {
        schema: MIGRATION_VERIFICATION_ENVIRONMENT_SCHEMA,
        postgres: parsePostgres(input.postgres),
        runner: await parseEnvironmentRunner(input.runner),
        bootstrapSqlDigest: sha256Digest(input.bootstrapSqlDigest, "migrationEnvironment.bootstrapSqlDigest"),
        roles: canonicalRecords(input.roles, "migrationEnvironment.roles", parseRole, (entry) => entry.name),
        grants: canonicalRecords(
            input.grants,
            "migrationEnvironment.grants",
            parseGrant,
            (entry) => `${entry.grantee}\0${entry.objectType}\0${entry.object}`,
        ),
        extensions: canonicalRecords(
            input.extensions,
            "migrationEnvironment.extensions",
            parseExtension,
            (entry) => entry.name,
        ),
        fixtures: canonicalRecords(
            input.fixtures,
            "migrationEnvironment.fixtures",
            parseFixture,
            (entry) => entry.fixtureId,
        ),
        sessionSettings: canonicalRecords(
            input.sessionSettings,
            "migrationEnvironment.sessionSettings",
            parseSessionSetting,
            (entry) => entry.name,
        ),
        policy: parseVerificationPolicyIdentity(input.policy, "migrationEnvironment.policy"),
    };
    return environment;
}

export async function identifyMigrationVerificationEnvironment(
    value: unknown,
): Promise<IdentifiedMigrationVerificationEnvironmentV1> {
    const environment = await validateMigrationVerificationEnvironment(value);
    const identified = await identifyCanonicalVerificationContract(environment);
    return { environment, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

function parsePostgres(value: unknown): MigrationVerificationEnvironmentV1["postgres"] {
    const input = strictRecord(value, "migrationEnvironment.postgres", ["version", "imageDigest"]);
    return {
        version: stableIdentifier(input.version, "migrationEnvironment.postgres.version"),
        imageDigest: imageDigest(input.imageDigest, "migrationEnvironment.postgres.imageDigest"),
    };
}

async function parseEnvironmentRunner(value: unknown): Promise<MigrationVerificationEnvironmentV1["runner"]> {
    const input = strictRecord(value, "migrationEnvironment.runner", ["digest", "identity"]);
    const identity = pinnedRunner(input.identity, "migrationEnvironment.runner.identity");
    const identified = await identifyCanonicalVerificationContract(identity);
    const digest = sha256Digest(input.digest, "migrationEnvironment.runner.digest");
    if (digest !== identified.digest) {
        invalid("migrationEnvironment.runner", "digest does not identify the pinned runner");
    }
    return { digest, identity };
}

function parseRole(value: unknown, field: string): MigrationVerificationEnvironmentV1["roles"][number] {
    const input = strictRecord(value, field, ["name", "attributes"]);
    return {
        name: stableIdentifier(input.name, `${field}.name`),
        attributes: canonicalIdentifiers(input.attributes, `${field}.attributes`, 64),
    };
}

function parseGrant(value: unknown, field: string): MigrationVerificationEnvironmentV1["grants"][number] {
    const input = strictRecord(value, field, ["grantee", "objectType", "object", "privileges"]);
    return {
        grantee: stableIdentifier(input.grantee, `${field}.grantee`),
        objectType: oneOf(input.objectType, `${field}.objectType`, OBJECT_TYPES),
        object: requiredText(input.object, `${field}.object`, 1_024),
        privileges: canonicalIdentifiers(input.privileges, `${field}.privileges`, 64),
    };
}

function parseExtension(value: unknown, field: string): MigrationVerificationEnvironmentV1["extensions"][number] {
    const input = strictRecord(value, field, ["name", "version"]);
    return {
        name: stableIdentifier(input.name, `${field}.name`),
        version: stableIdentifier(input.version, `${field}.version`),
    };
}

function parseFixture(value: unknown, field: string): MigrationVerificationEnvironmentV1["fixtures"][number] {
    const input = strictRecord(value, field, ["fixtureId", "digest"]);
    return {
        fixtureId: stableIdentifier(input.fixtureId, `${field}.fixtureId`),
        digest: sha256Digest(input.digest, `${field}.digest`),
    };
}

function parseSessionSetting(
    value: unknown,
    field: string,
): MigrationVerificationEnvironmentV1["sessionSettings"][number] {
    const input = strictRecord(value, field, ["name", "value"]);
    return {
        name: stableIdentifier(input.name, `${field}.name`),
        value: requiredText(input.value, `${field}.value`, 1_024),
    };
}

function canonicalRecords<T>(
    value: unknown,
    field: string,
    parser: (entry: unknown, entryField: string) => T,
    key: (entry: T) => string,
): T[] {
    const entries = boundedArray(value, field, parser, { maximum: MAX_MIGRATION_OBSERVATIONS });
    assertCanonicalUniqueOrder(entries, field, key);
    return entries;
}
