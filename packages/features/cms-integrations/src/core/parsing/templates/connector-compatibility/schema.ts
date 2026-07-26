import { IntegrationInputError } from "../../../errors";
import type {
    DeclarativeConnectorSchemaColumnContract,
    DeclarativeConnectorSchemaContract,
    DeclarativeConnectorSchemaNamespaceContract,
    DeclarativeConnectorSchemaRelationKind,
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
    assertOnlyKeys(input, ["name", "kind", "columns", "constraints"], name);
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
        ...(input.kind !== undefined ? { kind: parseRelationKind(input.kind, `${name}.kind`) } : {}),
        columns: sortByName(columns),
        constraints,
    };
}

function parseColumn(value: unknown, name: string, provider: string): DeclarativeConnectorSchemaColumnContract {
    const input = record(value, name);
    assertOnlyKeys(input, ["name", "type", "nullable", "default", "identity", "generated", "sequenceDependency"], name);
    const identity = input.identity === undefined ? undefined : parseIdentity(input.identity, `${name}.identity`);
    const defaultValue = input.default === undefined ? undefined : requiredText(input.default, `${name}.default`);
    const generated = input.generated === undefined ? undefined : parseGenerated(input.generated, `${name}.generated`);
    const sequenceDependency =
        input.sequenceDependency === undefined
            ? undefined
            : parseSequenceDependency(input.sequenceDependency, `${name}.sequenceDependency`);
    if (identity !== undefined && defaultValue !== undefined) {
        throw new IntegrationInputError(name, "must not declare both identity and default");
    }
    if (identity !== undefined && generated !== undefined) {
        throw new IntegrationInputError(name, "must not declare both identity and generated");
    }
    if (generated !== undefined && defaultValue === undefined) {
        throw new IntegrationInputError(`${name}.generated`, "requires a generated expression in default");
    }
    if (sequenceDependency === "internal" && identity === undefined) {
        throw new IntegrationInputError(`${name}.sequenceDependency`, "internal requires an identity mode");
    }
    if (identity !== undefined && sequenceDependency === "auto") {
        throw new IntegrationInputError(`${name}.sequenceDependency`, "identity columns require an internal sequence");
    }
    if (sequenceDependency === "auto" && defaultValue === undefined) {
        throw new IntegrationInputError(`${name}.sequenceDependency`, "auto requires a default expression");
    }
    return {
        name: requiredText(input.name, `${name}.name`),
        type: normalizeProviderType(input.type, `${name}.type`, provider),
        nullable: requiredBoolean(input.nullable, `${name}.nullable`),
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
        ...(identity !== undefined ? { identity } : {}),
        ...(generated !== undefined ? { generated } : {}),
        ...(sequenceDependency !== undefined ? { sequenceDependency } : {}),
    };
}

function parseRelationKind(value: unknown, name: string): DeclarativeConnectorSchemaRelationKind {
    const kind = requiredText(value, name);
    if (!RELATION_KINDS.has(kind as DeclarativeConnectorSchemaRelationKind)) {
        throw new IntegrationInputError(
            name,
            "must be table, partitioned-table, view, materialized-view, or foreign-table",
        );
    }
    return kind as DeclarativeConnectorSchemaRelationKind;
}

function parseIdentity(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorSchemaColumnContract["identity"]> {
    const identity = requiredText(value, name);
    if (identity !== "always" && identity !== "by-default") {
        throw new IntegrationInputError(name, "must be always or by-default");
    }
    return identity;
}

function parseGenerated(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorSchemaColumnContract["generated"]> {
    const generated = requiredText(value, name);
    if (generated !== "stored") {
        throw new IntegrationInputError(name, "must be stored");
    }
    return generated;
}

function parseSequenceDependency(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorSchemaColumnContract["sequenceDependency"]> {
    const dependency = requiredText(value, name);
    if (dependency !== "auto" && dependency !== "internal") {
        throw new IntegrationInputError(name, "must be auto or internal");
    }
    return dependency;
}

const RELATION_KINDS = new Set<DeclarativeConnectorSchemaRelationKind>([
    "table",
    "partitioned-table",
    "view",
    "materialized-view",
    "foreign-table",
]);

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
