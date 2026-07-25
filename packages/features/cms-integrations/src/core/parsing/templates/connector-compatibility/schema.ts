import { IntegrationInputError } from "../../../errors";
import type {
    DeclarativeConnectorSchemaColumnContract,
    DeclarativeConnectorSchemaContract,
    DeclarativeConnectorSchemaNamespaceContract,
    DeclarativeConnectorSchemaRelationContract,
} from "../../../../interfaces/Integration";
import { parseConstraints } from "./constraints";
import {
    array,
    assertOnlyKeys,
    assertUnique,
    normalizeProviderType,
    record,
    requiredBoolean,
    requiredText,
    sortByName,
} from "./values";

export function parseConnectorSchemaContract(
    value: unknown,
    provider: string,
    name = "connector.compatibility.schema",
): DeclarativeConnectorSchemaContract {
    const input = record(value, name);
    assertOnlyKeys(input, ["namespaces"], name);
    const namespaces = array(input.namespaces, `${name}.namespaces`, (entry, entryName) =>
        parseNamespace(entry, entryName, provider),
    );
    assertUnique(
        namespaces.map((namespace) => namespace.name),
        `${name}.namespaces`,
        "namespace",
    );
    return { namespaces: sortByName(namespaces) };
}

function parseNamespace(value: unknown, name: string, provider: string): DeclarativeConnectorSchemaNamespaceContract {
    const input = record(value, name);
    assertOnlyKeys(input, ["name", "relations"], name);
    const relations = array(input.relations, `${name}.relations`, (entry, entryName) =>
        parseRelation(entry, entryName, provider),
    );
    assertUnique(
        relations.map((relation) => relation.name),
        `${name}.relations`,
        "relation",
    );
    return {
        name: requiredText(input.name, `${name}.name`),
        relations: sortByName(relations),
    };
}

function parseRelation(value: unknown, name: string, provider: string): DeclarativeConnectorSchemaRelationContract {
    const input = record(value, name);
    assertOnlyKeys(input, ["name", "columns", "constraints"], name);
    const columns = array(input.columns, `${name}.columns`, (entry, entryName) =>
        parseColumn(entry, entryName, provider),
    );
    assertUnique(
        columns.map((column) => column.name),
        `${name}.columns`,
        "column",
    );
    const constraints = parseConstraints(input.constraints, `${name}.constraints`);
    assertConstraintColumns(constraints, new Set(columns.map((column) => column.name)), `${name}.constraints`);
    if (constraints.filter((constraint) => constraint.kind === "primary-key").length > 1) {
        throw new IntegrationInputError(`${name}.constraints`, "must contain at most one primary-key constraint");
    }
    return {
        name: requiredText(input.name, `${name}.name`),
        columns: sortByName(columns),
        constraints,
    };
}

function parseColumn(value: unknown, name: string, provider: string): DeclarativeConnectorSchemaColumnContract {
    const input = record(value, name);
    assertOnlyKeys(input, ["name", "type", "nullable", "default"], name);
    return {
        name: requiredText(input.name, `${name}.name`),
        type: normalizeProviderType(input.type, `${name}.type`, provider),
        nullable: requiredBoolean(input.nullable, `${name}.nullable`),
        ...(input.default !== undefined ? { default: requiredText(input.default, `${name}.default`) } : {}),
    };
}

function assertConstraintColumns(
    constraints: DeclarativeConnectorSchemaRelationContract["constraints"],
    columns: ReadonlySet<string>,
    name: string,
): void {
    for (const [index, constraint] of constraints.entries()) {
        if (constraint.kind === "check") {
            continue;
        }
        for (const column of constraint.columns) {
            if (!columns.has(column)) {
                throw new IntegrationInputError(`${name}.${index}.columns`, `references unknown column "${column}"`);
            }
        }
    }
}
