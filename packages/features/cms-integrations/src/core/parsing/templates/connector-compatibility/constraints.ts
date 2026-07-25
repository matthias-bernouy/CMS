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
    if (kind === "primary-key") {
        assertOnlyKeys(input, ["kind", "name", "columns"], name);
        return { kind, name: constraintName, columns: parseColumnNames(input.columns, `${name}.columns`) };
    }
    if (kind === "unique") {
        assertOnlyKeys(input, ["kind", "name", "columns", "nullsNotDistinct"], name);
        return {
            kind,
            name: constraintName,
            columns: parseColumnNames(input.columns, `${name}.columns`),
            nullsNotDistinct: optionalBoolean(input.nullsNotDistinct, `${name}.nullsNotDistinct`, false),
        };
    }
    if (kind === "foreign-key") {
        assertOnlyKeys(input, ["kind", "name", "columns", "references", "onUpdate", "onDelete"], name);
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
        };
    }
    if (kind === "check") {
        assertOnlyKeys(input, ["kind", "name", "expression"], name);
        return { kind, name: constraintName, expression: requiredText(input.expression, `${name}.expression`) };
    }
    throw new IntegrationInputError(`${name}.kind`, "must be primary-key, unique, foreign-key, or check");
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
