import type {
    DeclarativeConnectorDatabaseClockDefaultProjection,
    DeclarativeConnectorMigrationEquivalence,
} from "@bernouy/cms-integrations";
import { boundedArray, strictRecord } from "../../../validation/structure";
import { oneOf, requiredText } from "../../../validation/values";
import { assertCanonicalUniqueOrder, invalid } from "../shared";

const MAX_DATA_PROJECTIONS = 128;
const MAX_PROJECTION_COLUMNS = 128;

export function parseMigrationEquivalence(
    value: unknown,
    field: string,
): DeclarativeConnectorMigrationEquivalence | undefined {
    if (value === undefined) {
        return undefined;
    }
    const input = strictRecord(value, field, ["dataProjections"]);
    const dataProjections = boundedArray(input.dataProjections, `${field}.dataProjections`, parseDataProjection, {
        minimum: 1,
        maximum: MAX_DATA_PROJECTIONS,
    });
    assertCanonicalUniqueOrder(
        dataProjections,
        `${field}.dataProjections`,
        (entry) => `${entry.namespace}\0${entry.relation}\0${entry.kind}`,
    );
    return { dataProjections };
}

function parseDataProjection(value: unknown, field: string): DeclarativeConnectorDatabaseClockDefaultProjection {
    const input = strictRecord(value, field, ["kind", "namespace", "relation", "columns"]);
    const columns = boundedArray(input.columns, `${field}.columns`, parseProjectionIdentifier, {
        minimum: 1,
        maximum: MAX_PROJECTION_COLUMNS,
    });
    assertCanonicalUniqueOrder(columns, `${field}.columns`, (entry) => entry);
    return {
        kind: oneOf(input.kind, `${field}.kind`, ["database-clock-default"] as const),
        namespace: parseProjectionIdentifier(input.namespace, `${field}.namespace`),
        relation: parseProjectionIdentifier(input.relation, `${field}.relation`),
        columns,
    };
}

function parseProjectionIdentifier(value: unknown, field: string): string {
    const parsed = requiredText(typeof value === "string" ? value.trim() : value, field, 256);
    if (parsed.includes("\0")) {
        invalid(field, "must not contain NUL characters");
    }
    return parsed;
}
