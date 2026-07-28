import type {
    ObservedSchemaColumnV1,
    ObservedSchemaNamespaceV1,
    ObservedSchemaRelationV1,
} from "../../../interfaces/IntegrationConnectorDeployer";
import type { MutableObservedColumn, MutableObservedNamespace, MutableObservedRelation } from "./types";
import { compareObservedText, rowBoolean, rowOptionalText, rowString, rowText } from "./values";

export function createObservedNamespaces(
    requested: readonly string[],
    rows: readonly Record<string, unknown>[],
): Map<string, MutableObservedNamespace> {
    const found = new Set(rows.map((row) => rowText(row, "namespace_name")));
    for (const namespace of found) {
        if (!requested.includes(namespace)) {
            throw new TypeError(`PostgreSQL returned unrequested namespace "${namespace}"`);
        }
    }
    const missing = requested.find((namespace) => !found.has(namespace));
    if (missing) {
        throw new TypeError(`Owned PostgreSQL namespace "${missing}" does not exist`);
    }
    return new Map(requested.map((name) => [name, { name, relations: new Map() }]));
}

export function addObservedRelations(
    namespaces: Map<string, MutableObservedNamespace>,
    rows: readonly Record<string, unknown>[],
): void {
    for (const row of rows) {
        const namespace = requiredNamespace(namespaces, row);
        const name = rowText(row, "relation_name");
        if (namespace.relations.has(name)) {
            throw new TypeError(`PostgreSQL returned duplicate relation "${namespace.name}.${name}"`);
        }
        namespace.relations.set(name, {
            name,
            kind: relationKind(rowText(row, "relation_kind")),
            columns: new Map(),
            constraints: [],
        });
    }
}

export function addObservedColumns(
    namespaces: Map<string, MutableObservedNamespace>,
    rows: readonly Record<string, unknown>[],
): void {
    for (const row of rows) {
        const relation = requiredRelation(namespaces, row);
        const name = rowText(row, "column_name");
        const value = columnValue(row, name);
        const dependency = sequenceDependency(rowOptionalText(row, "sequence_dependency_code"));
        const existing = relation.columns.get(name);
        if (existing) {
            if (JSON.stringify(existing.value) !== JSON.stringify(value)) {
                throw new TypeError(`PostgreSQL returned inconsistent column rows for "${name}"`);
            }
            existing.sequenceDependencies.add(dependency);
        } else {
            relation.columns.set(name, { value, sequenceDependencies: new Set([dependency]) });
        }
    }
}

export function finalizeObservedNamespaces(
    namespaces: Map<string, MutableObservedNamespace>,
): ObservedSchemaNamespaceV1[] {
    return [...namespaces.values()].sort(compareNamed).map((namespace) => ({
        name: namespace.name,
        relations: [...namespace.relations.values()].sort(compareNamed).map(finalizeRelation),
    }));
}

export function requiredRelation(
    namespaces: Map<string, MutableObservedNamespace>,
    row: Record<string, unknown>,
): MutableObservedRelation {
    const namespace = requiredNamespace(namespaces, row);
    const relationName = rowText(row, "relation_name");
    const relation = namespace.relations.get(relationName);
    if (!relation) {
        throw new TypeError(`PostgreSQL returned a row for unknown relation "${namespace.name}.${relationName}"`);
    }
    return relation;
}

function columnValue(row: Record<string, unknown>, name: string) {
    const defaultValue = rowOptionalText(row, "default_expression");
    return {
        name,
        type: rowText(row, "formatted_type"),
        nullable: rowBoolean(row, "nullable"),
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
        identity: identityMode(rowString(row, "identity_code"), "identity_code"),
        generated: generatedMode(rowString(row, "generated_code")),
    } satisfies Omit<ObservedSchemaColumnV1, "sequenceDependency">;
}

function finalizeRelation(relation: MutableObservedRelation): ObservedSchemaRelationV1 {
    return {
        name: relation.name,
        kind: relation.kind,
        columns: [...relation.columns.values()].map(finalizeColumn).sort(compareNamed),
        constraints: [...relation.constraints].sort(compareNamed),
    };
}

function finalizeColumn(column: MutableObservedColumn) {
    const dependencies = [...column.sequenceDependencies];
    if (dependencies.length !== 1) {
        throw new TypeError("PostgreSQL column has conflicting sequence dependency modes");
    }
    return { ...column.value, sequenceDependency: dependencies[0]! };
}

function requiredNamespace(
    namespaces: Map<string, MutableObservedNamespace>,
    row: Record<string, unknown>,
): MutableObservedNamespace {
    const name = rowText(row, "namespace_name");
    const namespace = namespaces.get(name);
    if (!namespace) {
        throw new TypeError(`PostgreSQL returned a row for unrequested namespace "${name}"`);
    }
    return namespace;
}

function relationKind(value: string): ObservedSchemaRelationV1["kind"] {
    const kinds = {
        r: "table",
        p: "partitioned-table",
        v: "view",
        m: "materialized-view",
        f: "foreign-table",
    } as const;
    const kind = kinds[value as keyof typeof kinds];
    if (!kind) {
        throw new TypeError(`Unsupported PostgreSQL relation kind "${value}"`);
    }
    return kind;
}

function identityMode(value: string, field: string): ObservedSchemaColumnV1["identity"] {
    if (value === "") {
        return "none";
    }
    if (value === "a") {
        return "always";
    }
    if (value === "d") {
        return "by-default";
    }
    throw new TypeError(`Unsupported PostgreSQL ${field} "${value}"`);
}

function generatedMode(value: string): ObservedSchemaColumnV1["generated"] {
    if (value === "") {
        return "none";
    }
    if (value === "s") {
        return "stored";
    }
    throw new TypeError(`Unsupported PostgreSQL generated_code "${value}"`);
}

function sequenceDependency(value: string | undefined): ObservedSchemaColumnV1["sequenceDependency"] {
    if (value === undefined) {
        return "none";
    }
    if (value === "a") {
        return "auto";
    }
    if (value === "i") {
        return "internal";
    }
    throw new TypeError(`Unsupported PostgreSQL sequence dependency code "${value}"`);
}

function compareNamed(left: { name: string }, right: { name: string }): number {
    return compareObservedText(left.name, right.name);
}
