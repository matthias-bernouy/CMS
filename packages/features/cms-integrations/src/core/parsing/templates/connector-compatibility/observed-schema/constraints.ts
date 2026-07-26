import { IntegrationInputError } from "../../../../errors";
import type {
    DeclarativeConnectorSchemaForeignKeyAction,
    ObservedSchemaConstraintV1,
} from "../../../../../interfaces/Integration";
import { assertOnlyKeys, record, requiredBoolean, requiredText, sortByName } from "../values";

const COMMON_KEYS = ["kind", "name", "deferrable", "initiallyDeferred", "validated"] as const;
const ACTIONS = new Set<DeclarativeConnectorSchemaForeignKeyAction>([
    "no-action",
    "restrict",
    "cascade",
    "set-null",
    "set-default",
]);

export function parseObservedConstraints(
    value: unknown,
    name: string,
    localColumns: ReadonlySet<string>,
): ObservedSchemaConstraintV1[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    if (value.length > 4_096) {
        throw new IntegrationInputError(name, "must not contain more than 4096 constraints");
    }
    const constraints = value.map((entry, index) => parseConstraint(entry, `${name}.${index}`));
    assertUniqueNames(constraints, name);
    for (const [index, constraint] of constraints.entries()) {
        if (constraint.kind !== "check") {
            assertLocalColumns(constraint.columns, localColumns, `${name}.${index}.columns`);
        }
    }
    if (constraints.filter((constraint) => constraint.kind === "primary-key").length > 1) {
        throw new IntegrationInputError(name, "must contain at most one primary-key constraint");
    }
    return sortByName(constraints);
}

function parseConstraint(value: unknown, name: string): ObservedSchemaConstraintV1 {
    const input = record(value, name);
    const kind = requiredText(input.kind, `${name}.kind`);
    const common = parseCommon(input, name);
    if (kind === "primary-key") {
        assertOnlyKeys(input, [...COMMON_KEYS, "columns"], name);
        return { kind, ...common, columns: parseColumns(input.columns, `${name}.columns`) };
    }
    if (kind === "unique") {
        assertOnlyKeys(input, [...COMMON_KEYS, "columns", "nullsNotDistinct"], name);
        return {
            kind,
            ...common,
            columns: parseColumns(input.columns, `${name}.columns`),
            nullsNotDistinct: requiredBoolean(input.nullsNotDistinct, `${name}.nullsNotDistinct`),
        };
    }
    if (kind === "foreign-key") {
        return parseForeignKey(input, name, common);
    }
    if (kind === "check") {
        assertOnlyKeys(input, [...COMMON_KEYS, "expression"], name);
        if (common.deferrable) {
            throw new IntegrationInputError(`${name}.deferrable`, "check constraints cannot be deferrable");
        }
        return { kind, ...common, expression: boundedText(input.expression, `${name}.expression`, 65_536) };
    }
    throw new IntegrationInputError(`${name}.kind`, "must be primary-key, unique, foreign-key, or check");
}

function parseCommon(input: Record<string, unknown>, name: string) {
    const deferrable = requiredBoolean(input.deferrable, `${name}.deferrable`);
    const initiallyDeferred = requiredBoolean(input.initiallyDeferred, `${name}.initiallyDeferred`);
    if (initiallyDeferred && !deferrable) {
        throw new IntegrationInputError(`${name}.initiallyDeferred`, "requires deferrable to be true");
    }
    return {
        name: boundedText(input.name, `${name}.name`, 63),
        deferrable,
        initiallyDeferred,
        validated: requiredBoolean(input.validated, `${name}.validated`),
    };
}

function parseForeignKey(
    input: Record<string, unknown>,
    name: string,
    common: ReturnType<typeof parseCommon>,
): ObservedSchemaConstraintV1 {
    assertOnlyKeys(input, [...COMMON_KEYS, "columns", "references", "onUpdate", "onDelete", "matchType"], name);
    const columns = parseColumns(input.columns, `${name}.columns`);
    const reference = record(input.references, `${name}.references`);
    assertOnlyKeys(reference, ["namespace", "relation", "columns"], `${name}.references`);
    const referencedColumns = parseColumns(reference.columns, `${name}.references.columns`);
    if (columns.length !== referencedColumns.length) {
        throw new IntegrationInputError(`${name}.references.columns`, "must match the local column count");
    }
    return {
        kind: "foreign-key",
        ...common,
        columns,
        references: {
            namespace: boundedText(reference.namespace, `${name}.references.namespace`, 63),
            relation: boundedText(reference.relation, `${name}.references.relation`, 63),
            columns: referencedColumns,
        },
        onUpdate: parseAction(input.onUpdate, `${name}.onUpdate`),
        onDelete: parseAction(input.onDelete, `${name}.onDelete`),
        matchType: parseMatchType(input.matchType, `${name}.matchType`),
    };
}

function parseColumns(value: unknown, name: string): string[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 2_048) {
        throw new IntegrationInputError(name, "must be an array containing between 1 and 2048 columns");
    }
    const columns = value.map((entry, index) => boundedText(entry, `${name}.${index}`, 63));
    if (new Set(columns).size !== columns.length) {
        throw new IntegrationInputError(name, "must not contain duplicate columns");
    }
    return columns;
}

function parseAction(value: unknown, name: string): DeclarativeConnectorSchemaForeignKeyAction {
    const action = requiredText(value, name) as DeclarativeConnectorSchemaForeignKeyAction;
    if (!ACTIONS.has(action)) {
        throw new IntegrationInputError(name, "must be no-action, restrict, cascade, set-null, or set-default");
    }
    return action;
}

function parseMatchType(value: unknown, name: string): "simple" | "full" | "partial" {
    const matchType = requiredText(value, name);
    if (matchType !== "simple" && matchType !== "full" && matchType !== "partial") {
        throw new IntegrationInputError(name, "must be simple, full, or partial");
    }
    return matchType;
}

function assertUniqueNames(constraints: readonly ObservedSchemaConstraintV1[], name: string): void {
    const names = constraints.map((constraint) => constraint.name);
    if (new Set(names).size !== names.length) {
        throw new IntegrationInputError(name, "must not contain duplicate constraint names");
    }
}

function assertLocalColumns(columns: readonly string[], local: ReadonlySet<string>, name: string): void {
    for (const column of columns) {
        if (!local.has(column)) {
            throw new IntegrationInputError(name, `references unknown column "${column}"`);
        }
    }
}

function boundedText(value: unknown, name: string, maximumLength: number): string {
    const parsed = requiredText(value, name);
    if (new TextEncoder().encode(parsed).byteLength > maximumLength) {
        throw new IntegrationInputError(name, `must not exceed ${maximumLength} UTF-8 bytes`);
    }
    return parsed;
}
