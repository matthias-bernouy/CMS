import { assertIntegrationPackagePath } from "@bernouy/cms-integration-packages";
import type {
    DeclarativeConnectorInstallBaseline,
    DeclarativeConnectorMigrationDescriptor,
    DeclarativeConnectorMigrationReference,
    DeclarativeConnectorRepeatableDescriptor,
} from "@bernouy/cms-integrations";
import { wrapPackageValidation } from "../../../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../../../validation/structure";
import { exactVersion, nonNegativeInteger, oneOf, requiredText, stableIdentifier } from "../../../validation/values";
import { assertCanonicalUniqueOrder, invalid, MAX_MIGRATION_DESCRIPTORS, migrationChecksum } from "../shared";

export function parseMigrationInstall(value: unknown, field: string): DeclarativeConnectorInstallBaseline {
    const input = strictRecord(value, field, ["revision", "digest", "coveredMigrations"]);
    const coveredMigrations = boundedArray(
        input.coveredMigrations,
        `${field}.coveredMigrations`,
        parseMigrationReference,
        { maximum: MAX_MIGRATION_DESCRIPTORS },
    );
    assertUnique(
        coveredMigrations.map((entry) => entry.id),
        `${field}.coveredMigrations.id`,
    );
    assertCanonicalUniqueOrder(
        coveredMigrations,
        `${field}.coveredMigrations`,
        (entry) => `${numericKey(entry.revision)}\0${entry.id}`,
    );
    return {
        revision: nonNegativeInteger(input.revision, `${field}.revision`),
        digest: migrationChecksum(input.digest, `${field}.digest`),
        coveredMigrations,
    };
}

export function parseMigrations(value: unknown, field: string): DeclarativeConnectorMigrationDescriptor[] {
    const migrations = boundedArray(value, field, parseMigrationDescriptor, {
        maximum: MAX_MIGRATION_DESCRIPTORS,
    });
    assertUnique(
        migrations.map((entry) => entry.id),
        `${field}.id`,
    );
    assertCanonicalUniqueOrder(migrations, field, (entry) => `${numericKey(entry.toRevision)}\0${entry.id}`);
    return migrations;
}

export function parseRepeatables(value: unknown, field: string): DeclarativeConnectorRepeatableDescriptor[] {
    if (value === undefined) {
        return [];
    }
    const repeatables = boundedArray(value, field, parseRepeatable, { maximum: MAX_MIGRATION_DESCRIPTORS });
    assertUnique(
        repeatables.map((entry) => entry.id),
        `${field}.id`,
    );
    assertCanonicalUniqueOrder(repeatables, field, (entry) => entry.id);
    return repeatables;
}

function parseMigrationReference(value: unknown, field: string): DeclarativeConnectorMigrationReference {
    const input = strictRecord(value, field, ["id", "checksum", "revision", "introducedIn"]);
    return {
        id: stableIdentifier(input.id, `${field}.id`),
        checksum: migrationChecksum(input.checksum, `${field}.checksum`),
        revision: nonNegativeInteger(input.revision, `${field}.revision`),
        introducedIn: exactVersion(input.introducedIn, `${field}.introducedIn`),
    };
}

function parseMigrationDescriptor(value: unknown, field: string): DeclarativeConnectorMigrationDescriptor {
    const input = strictRecord(value, field, [
        "id",
        "checksum",
        "fromRevision",
        "toRevision",
        "introducedIn",
        "transaction",
        "phase",
        "path",
    ]);
    const fromRevision = nonNegativeInteger(input.fromRevision, `${field}.fromRevision`);
    const toRevision = nonNegativeInteger(input.toRevision, `${field}.toRevision`);
    if (toRevision !== fromRevision + 1) {
        invalid(`${field}.toRevision`, "must increment fromRevision by exactly one");
    }
    return {
        id: stableIdentifier(input.id, `${field}.id`),
        checksum: migrationChecksum(input.checksum, `${field}.checksum`),
        fromRevision,
        toRevision,
        introducedIn: exactVersion(input.introducedIn, `${field}.introducedIn`),
        transaction: oneOf(input.transaction, `${field}.transaction`, ["atomic"] as const),
        phase: oneOf(input.phase, `${field}.phase`, ["expand", "contract"] as const),
        path: migrationPath(input.path, `${field}.path`, "migrations/"),
    };
}

function parseRepeatable(value: unknown, field: string): DeclarativeConnectorRepeatableDescriptor {
    const input = strictRecord(value, field, ["id", "checksum", "path"]);
    return {
        id: stableIdentifier(input.id, `${field}.id`),
        checksum: migrationChecksum(input.checksum, `${field}.checksum`),
        path: migrationPath(input.path, `${field}.path`, "repeatables/"),
    };
}

function migrationPath(value: unknown, field: string, prefix: string): string {
    const parsed = requiredText(value, field, 4_096);
    const path = wrapPackageValidation(() => assertIntegrationPackagePath(parsed));
    if (!path.startsWith(prefix)) {
        invalid(field, `must stay under ${prefix}`);
    }
    return path;
}

function numericKey(value: number): string {
    return value.toString().padStart(16, "0");
}
