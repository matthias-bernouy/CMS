import {
    parseObservedSchemaContractV1,
    type DeclarativeConnectorMigrationSource,
    type IntegrationCmsMediatedCutover,
    type IntegrationProviderDirectCutover,
} from "@bernouy/cms-integrations";
import { assertUnique, boundedArray, strictRecord } from "../../../validation/structure";
import {
    exactVersion,
    nonNegativeInteger,
    oneOf,
    sha256Digest,
    supportedVersionRange,
} from "../../../validation/values";
import {
    assertCanonicalUniqueOrder,
    canonicalIdentifiers,
    MAX_MIGRATION_DESCRIPTORS,
    migrationChecksum,
} from "../shared";
import { parseMigrationReference } from "./descriptors";

export function parseMigrationSources(value: unknown, field: string): DeclarativeConnectorMigrationSource[] {
    const sources = boundedArray(value, field, parseSource, { minimum: 1, maximum: MAX_MIGRATION_DESCRIPTORS });
    assertUnique(
        sources.map((entry) => entry.range),
        `${field}.range`,
    );
    assertCanonicalUniqueOrder(sources, field, (entry) => entry.range);
    return sources;
}

export function parseCmsMediatedCutover(value: unknown, field: string): IntegrationCmsMediatedCutover | undefined {
    if (value === undefined) {
        return undefined;
    }
    const input = strictRecord(value, field, ["strategy", "drainSeconds"]);
    return {
        strategy: oneOf(input.strategy, `${field}.strategy`, ["binding-switch"] as const),
        ...(input.drainSeconds === undefined
            ? {}
            : { drainSeconds: nonNegativeInteger(input.drainSeconds, `${field}.drainSeconds`) }),
    };
}

export function parseProviderDirectCutover(
    value: unknown,
    field: string,
): IntegrationProviderDirectCutover | undefined {
    if (value === undefined) {
        return undefined;
    }
    const input = strictRecord(value, field, ["strategy", "callbackIds", "drainSeconds"]);
    return {
        strategy: oneOf(input.strategy, `${field}.strategy`, ["expand-in-code", "journalled-provider-switch"] as const),
        callbackIds: canonicalIdentifiers(input.callbackIds, `${field}.callbackIds`, MAX_MIGRATION_DESCRIPTORS),
        ...(input.drainSeconds === undefined
            ? {}
            : { drainSeconds: nonNegativeInteger(input.drainSeconds, `${field}.drainSeconds`) }),
    };
}

function parseSource(value: unknown, field: string): DeclarativeConnectorMigrationSource {
    const input = strictRecord(value, field, ["range", "migrationRevision", "legacyAdoption"]);
    return {
        range: supportedVersionRange(input.range, `${field}.range`),
        migrationRevision: nonNegativeInteger(input.migrationRevision, `${field}.migrationRevision`),
        ...(input.legacyAdoption === undefined
            ? {}
            : { legacyAdoption: parseLegacyAdoption(input.legacyAdoption, `${field}.legacyAdoption`) }),
    };
}

function parseLegacyAdoption(value: unknown, field: string) {
    const input = strictRecord(value, field, [
        "definitionVersion",
        "packageDigest",
        "installDigest",
        "observedSchema",
        "coveredMigrations",
    ]);
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
        (entry) => `${entry.revision.toString().padStart(16, "0")}\0${entry.id}`,
    );
    return {
        definitionVersion: exactVersion(input.definitionVersion, `${field}.definitionVersion`),
        packageDigest: sha256Digest(input.packageDigest, `${field}.packageDigest`),
        installDigest: migrationChecksum(input.installDigest, `${field}.installDigest`),
        observedSchema: parseObservedSchemaContractV1(input.observedSchema, `${field}.observedSchema`),
        coveredMigrations,
    };
}
