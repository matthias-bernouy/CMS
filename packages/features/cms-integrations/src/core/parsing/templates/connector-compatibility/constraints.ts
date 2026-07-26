import { IntegrationInputError } from "../../../errors";
import type {
    DeclarativeConnectorSchemaConstraintContract,
    DeclarativeConnectorSchemaForeignKeyAction,
} from "../../../../interfaces/Integration";
import { array, assertOnlyKeys, assertUnique, optionalBoolean, record, requiredText, sortByName } from "./values";

const FOREIGN_KEY_ACTIONS = new Set<DeclarativeConnectorSchemaForeignKeyAction>([
    "no-action",
    "restrict",
    "cascade",
    "set-null",
    "set-default",
]);

export function parseConstraints(value: unknown, name: string): DeclarativeConnectorSchemaConstraintContract[] {
    const constraints = array(value, name, parseConstraint);
    assertUnique(
        constraints.map((constraint) => constraint.name),
        name,
        "constraint name",
    );
    return sortByName(constraints);
}

function parseConstraint(value: unknown, name: string): DeclarativeConnectorSchemaConstraintContract {
    const input = record(value, name);
    const kind = requiredText(input.kind, `${name}.kind`);
    const constraintName = requiredText(input.name, `${name}.name`);
    const options = parseConstraintOptions(input, name);
    if (kind === "primary-key") {
        assertOnlyKeys(input, ["kind", "name", "columns", ...CONSTRAINT_OPTION_KEYS], name);
        return { kind, name: constraintName, columns: parseColumnNames(input.columns, `${name}.columns`), ...options };
    }
    if (kind === "unique") {
        assertOnlyKeys(input, ["kind", "name", "columns", "nullsNotDistinct", ...CONSTRAINT_OPTION_KEYS], name);
        return {
            kind,
            name: constraintName,
            columns: parseColumnNames(input.columns, `${name}.columns`),
            nullsNotDistinct: optionalBoolean(input.nullsNotDistinct, `${name}.nullsNotDistinct`, false),
            ...options,
        };
    }
    if (kind === "foreign-key") {
        assertOnlyKeys(
            input,
            ["kind", "name", "columns", "references", "onUpdate", "onDelete", "matchType", ...CONSTRAINT_OPTION_KEYS],
            name,
        );
        const columns = parseColumnNames(input.columns, `${name}.columns`);
        const references = parseReference(input.references, `${name}.references`);
        if (columns.length !== references.columns.length) {
            throw new IntegrationInputError(`${name}.references.columns`, "must match the local column count");
        }
        return {
            kind,
            name: constraintName,
            columns,
            references,
            onUpdate: parseForeignKeyAction(input.onUpdate, `${name}.onUpdate`),
            onDelete: parseForeignKeyAction(input.onDelete, `${name}.onDelete`),
            ...(input.matchType !== undefined
                ? { matchType: parseMatchType(input.matchType, `${name}.matchType`) }
                : {}),
            ...options,
        };
    }
    if (kind === "check") {
        assertOnlyKeys(input, ["kind", "name", "expression", ...CONSTRAINT_OPTION_KEYS], name);
        if (options.deferrable) {
            throw new IntegrationInputError(`${name}.deferrable`, "check constraints cannot be deferrable");
        }
        return {
            kind,
            name: constraintName,
            expression: requiredText(input.expression, `${name}.expression`),
            ...options,
        };
    }
    throw new IntegrationInputError(`${name}.kind`, "must be primary-key, unique, foreign-key, or check");
}

const CONSTRAINT_OPTION_KEYS = ["deferrable", "initiallyDeferred", "validated"] as const;

function parseConstraintOptions(input: Record<string, unknown>, name: string) {
    const deferrable = optionalBoolean(input.deferrable, `${name}.deferrable`, false);
    const initiallyDeferred = optionalBoolean(input.initiallyDeferred, `${name}.initiallyDeferred`, false);
    const validated = optionalBoolean(input.validated, `${name}.validated`, true);
    if (initiallyDeferred && !deferrable) {
        throw new IntegrationInputError(`${name}.initiallyDeferred`, "requires deferrable to be true");
    }
    return {
        ...(input.deferrable !== undefined ? { deferrable } : {}),
        ...(input.initiallyDeferred !== undefined ? { initiallyDeferred } : {}),
        ...(input.validated !== undefined ? { validated } : {}),
    };
}

function parseReference(value: unknown, name: string) {
    const input = record(value, name);
    assertOnlyKeys(input, ["namespace", "relation", "columns"], name);
    return {
        namespace: requiredText(input.namespace, `${name}.namespace`),
        relation: requiredText(input.relation, `${name}.relation`),
        columns: parseColumnNames(input.columns, `${name}.columns`),
    };
}

function parseColumnNames(value: unknown, name: string): string[] {
    const columns = array(value, name, requiredText);
    if (columns.length === 0) {
        throw new IntegrationInputError(name, "must contain at least one column");
    }
    assertUnique(columns, name, "column");
    return columns;
}

function parseForeignKeyAction(value: unknown, name: string): DeclarativeConnectorSchemaForeignKeyAction {
    if (value === undefined) {
        return "no-action";
    }
    const action = requiredText(value, name);
    if (!FOREIGN_KEY_ACTIONS.has(action as DeclarativeConnectorSchemaForeignKeyAction)) {
        throw new IntegrationInputError(name, "must be no-action, restrict, cascade, set-null, or set-default");
    }
    return action as DeclarativeConnectorSchemaForeignKeyAction;
}

function parseMatchType(value: unknown, name: string): "simple" | "full" | "partial" {
    const matchType = requiredText(value, name);
    if (matchType !== "simple" && matchType !== "full" && matchType !== "partial") {
        throw new IntegrationInputError(name, "must be simple, full, or partial");
    }
    return matchType;
}
