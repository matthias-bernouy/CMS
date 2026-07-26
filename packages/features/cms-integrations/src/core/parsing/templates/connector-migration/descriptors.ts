import { isSupportedIntegrationVersionRange } from "../../../definitions/versioning";
import { parseObservedSchemaContractV1 } from "../connector-compatibility";
import type {
    DeclarativeConnectorMigrationDescriptor,
    DeclarativeConnectorMigrationPlan,
    DeclarativeConnectorMigrationReference,
    DeclarativeConnectorRepeatableDescriptor,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { text } from "../../definition/values";
import {
    assertMigrationLayoutPath,
    assertRequiredMigrationKeys,
    invalidMigrationValue,
    migrationArray,
    migrationRecord,
    parseMigrationChecksum,
    parseMigrationId,
    parseMigrationPackagePath,
    parseMigrationPackageDigest,
    parseMigrationRevision,
    parseMigrationVersion,
} from "./values";

export function parseMigrationInstall(value: unknown, name: string): DeclarativeConnectorMigrationPlan["install"] {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["revision", "digest", "coveredMigrations"], name);
    return {
        revision: parseMigrationRevision(input.revision, `${name}.revision`),
        digest: parseMigrationChecksum(input.digest, `${name}.digest`),
        coveredMigrations: migrationArray(input.coveredMigrations, `${name}.coveredMigrations`).map((entry, index) =>
            parseMigrationReference(entry, `${name}.coveredMigrations.${index}`),
        ),
    };
}

export function parseMigrationDescriptor(value: unknown, name: string): DeclarativeConnectorMigrationDescriptor {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(
        input,
        ["id", "checksum", "fromRevision", "toRevision", "introducedIn", "transaction", "phase", "path"],
        name,
    );
    if (input.transaction !== "atomic") {
        invalidMigrationValue(`${name}.transaction`, 'must be "atomic"');
    }
    if (input.phase !== "expand" && input.phase !== "contract") {
        invalidMigrationValue(`${name}.phase`, 'must be "expand" or "contract"');
    }
    const path = parseMigrationPackagePath(input.path, `${name}.path`);
    assertMigrationLayoutPath(path, "migrations/", `${name}.path`);
    const fromRevision = parseMigrationRevision(input.fromRevision, `${name}.fromRevision`);
    const toRevision = parseMigrationRevision(input.toRevision, `${name}.toRevision`);
    if (toRevision !== fromRevision + 1) {
        invalidMigrationValue(`${name}.toRevision`, "must increment fromRevision by exactly one");
    }
    return {
        id: parseMigrationId(input.id, `${name}.id`),
        checksum: parseMigrationChecksum(input.checksum, `${name}.checksum`),
        fromRevision,
        toRevision,
        introducedIn: parseMigrationVersion(input.introducedIn, `${name}.introducedIn`),
        transaction: "atomic",
        phase: input.phase,
        path,
    };
}

export function parseMigrationRepeatable(value: unknown, name: string): DeclarativeConnectorRepeatableDescriptor {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["id", "checksum", "path"], name);
    const path = parseMigrationPackagePath(input.path, `${name}.path`);
    assertMigrationLayoutPath(path, "repeatables/", `${name}.path`);
    return {
        id: parseMigrationId(input.id, `${name}.id`),
        checksum: parseMigrationChecksum(input.checksum, `${name}.checksum`),
        path,
    };
}

export function parseMigrationSources(value: unknown, name: string) {
    const ranges = migrationArray(value, name).map((entry, index) => {
        const source = migrationRecord(entry, `${name}.${index}`);
        assertRequiredMigrationKeys(source, ["range", "migrationRevision"], `${name}.${index}`, ["legacyAdoption"]);
        const range = text(source.range);
        if (!range || !isSupportedIntegrationVersionRange(range)) {
            invalidMigrationValue(
                `${name}.${index}.range`,
                "must be a supported exact, caret, tilde, or bounded version range",
            );
        }
        return {
            range,
            migrationRevision: parseMigrationRevision(source.migrationRevision, `${name}.${index}.migrationRevision`),
            ...(source.legacyAdoption === undefined
                ? {}
                : { legacyAdoption: parseLegacyAdoption(source.legacyAdoption, `${name}.${index}.legacyAdoption`) }),
        };
    });
    if (new Set(ranges.map((entry) => entry.range)).size !== ranges.length) {
        invalidMigrationValue(name, "must contain unique ranges");
    }
    return ranges;
}

function parseLegacyAdoption(value: unknown, name: string) {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["definitionVersion", "packageDigest", "observedSchema"], name);
    return {
        definitionVersion: parseMigrationVersion(input.definitionVersion, `${name}.definitionVersion`),
        packageDigest: parseMigrationPackageDigest(input.packageDigest, `${name}.packageDigest`),
        observedSchema: parseObservedSchemaContractV1(input.observedSchema, `${name}.observedSchema`),
    };
}

function parseMigrationReference(value: unknown, name: string): DeclarativeConnectorMigrationReference {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["id", "checksum", "revision", "introducedIn"], name);
    return {
        id: parseMigrationId(input.id, `${name}.id`),
        checksum: parseMigrationChecksum(input.checksum, `${name}.checksum`),
        revision: parseMigrationRevision(input.revision, `${name}.revision`),
        introducedIn: parseMigrationVersion(input.introducedIn, `${name}.introducedIn`),
    };
}
