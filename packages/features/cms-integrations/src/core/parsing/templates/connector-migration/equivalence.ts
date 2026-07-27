import type {
    DeclarativeConnectorDatabaseClockDefaultProjection,
    DeclarativeConnectorMigrationEquivalence,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { text } from "../../definition/values";
import { assertRequiredMigrationKeys, invalidMigrationValue, migrationArray, migrationRecord } from "./values";

const MAX_DATA_PROJECTIONS = 128;
const MAX_PROJECTION_COLUMNS = 128;
const MAX_IDENTIFIER_BYTES = 256;
const utf8 = new TextEncoder();

export function parseMigrationEquivalence(value: unknown, name: string): DeclarativeConnectorMigrationEquivalence {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["dataProjections"], name);
    const dataProjections = boundedMigrationArray(
        input.dataProjections,
        `${name}.dataProjections`,
        1,
        MAX_DATA_PROJECTIONS,
    ).map((entry, index) => parseDataProjection(entry, `${name}.dataProjections.${index}`));
    assertCanonicalUniqueOrder(
        dataProjections,
        `${name}.dataProjections`,
        (entry) => `${entry.namespace}\0${entry.relation}\0${entry.kind}`,
    );
    return { dataProjections };
}

function parseDataProjection(value: unknown, name: string): DeclarativeConnectorDatabaseClockDefaultProjection {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["kind", "namespace", "relation", "columns"], name);
    if (input.kind !== "database-clock-default") {
        invalidMigrationValue(`${name}.kind`, 'must be "database-clock-default"');
    }
    const columns = boundedMigrationArray(input.columns, `${name}.columns`, 1, MAX_PROJECTION_COLUMNS).map(
        (entry, index) => parseProjectionIdentifier(entry, `${name}.columns.${index}`),
    );
    assertCanonicalUniqueOrder(columns, `${name}.columns`, (entry) => entry);
    return {
        kind: "database-clock-default",
        namespace: parseProjectionIdentifier(input.namespace, `${name}.namespace`),
        relation: parseProjectionIdentifier(input.relation, `${name}.relation`),
        columns,
    };
}

function boundedMigrationArray(value: unknown, name: string, minimum: number, maximum: number): unknown[] {
    const values = migrationArray(value, name);
    if (values.length < minimum || values.length > maximum) {
        invalidMigrationValue(name, `must contain between ${minimum} and ${maximum} entries`);
    }
    return values;
}

function parseProjectionIdentifier(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed || parsed.includes("\0")) {
        invalidMigrationValue(name, "must be a non-empty identifier without NUL characters");
    }
    if (utf8.encode(parsed).byteLength > MAX_IDENTIFIER_BYTES) {
        invalidMigrationValue(name, `must not exceed ${MAX_IDENTIFIER_BYTES} UTF-8 bytes`);
    }
    return parsed;
}

function assertCanonicalUniqueOrder<T>(values: readonly T[], name: string, key: (value: T) => string): void {
    const keys = values.map(key);
    if (new Set(keys).size !== keys.length) {
        invalidMigrationValue(name, "must contain unique entries");
    }
    const ordered = [...keys].sort(compareText);
    if (keys.some((entry, index) => entry !== ordered[index])) {
        invalidMigrationValue(name, "must use canonical lexical order");
    }
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
