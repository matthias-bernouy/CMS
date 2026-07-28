import { IntegrationInputError } from "../../../../errors";
import {
    OBSERVED_SCHEMA_CONTRACT_V1,
    type ObservedSchemaColumnV1,
    type ObservedSchemaContractV1,
    type ObservedSchemaNamespaceV1,
    type ObservedSchemaOwnerV1,
    type ObservedSchemaRelationV1,
} from "../../../../../interfaces/Integration";
import { assertOnlyKeys, normalizeProviderType, record, requiredBoolean, requiredText, sortByName } from "../values";
import { parseObservedConstraints } from "./constraints";

export function parseObservedSchemaContractV1(value: unknown, name = "observedSchema"): ObservedSchemaContractV1 {
    const input = record(value, name);
    assertOnlyKeys(input, ["schema", "owner", "namespaces"], name);
    if (input.schema !== OBSERVED_SCHEMA_CONTRACT_V1) {
        throw new IntegrationInputError(`${name}.schema`, `must be ${OBSERVED_SCHEMA_CONTRACT_V1}`);
    }
    const namespaces = boundedArray(input.namespaces, `${name}.namespaces`, 128, parseNamespace);
    assertUnique(namespaces, `${name}.namespaces`, "namespace");
    return {
        schema: OBSERVED_SCHEMA_CONTRACT_V1,
        owner: parseOwner(input.owner, `${name}.owner`),
        namespaces: sortByName(namespaces),
    };
}

function parseOwner(value: unknown, name: string): ObservedSchemaOwnerV1 {
    const input = record(value, name);
    assertOnlyKeys(input, ["connectorKey", "lineageId"], name);
    return {
        connectorKey: stableIdentifier(input.connectorKey, `${name}.connectorKey`),
        lineageId: stableIdentifier(input.lineageId, `${name}.lineageId`),
    };
}

function parseNamespace(value: unknown, name: string): ObservedSchemaNamespaceV1 {
    const input = record(value, name);
    assertOnlyKeys(input, ["name", "relations"], name);
    const relations = boundedArray(input.relations, `${name}.relations`, 4_096, parseRelation);
    assertUnique(relations, `${name}.relations`, "relation");
    return { name: postgresIdentifier(input.name, `${name}.name`), relations: sortByName(relations) };
}

function parseRelation(value: unknown, name: string): ObservedSchemaRelationV1 {
    const input = record(value, name);
    assertOnlyKeys(input, ["name", "kind", "columns", "constraints"], name);
    const columns = boundedArray(input.columns, `${name}.columns`, 2_048, parseColumn);
    assertUnique(columns, `${name}.columns`, "column");
    const columnNames = new Set(columns.map((column) => column.name));
    return {
        name: postgresIdentifier(input.name, `${name}.name`),
        kind: relationKind(input.kind, `${name}.kind`),
        columns: sortByName(columns),
        constraints: parseObservedConstraints(input.constraints, `${name}.constraints`, columnNames),
    };
}

function parseColumn(value: unknown, name: string): ObservedSchemaColumnV1 {
    const input = record(value, name);
    assertOnlyKeys(input, ["name", "type", "nullable", "default", "identity", "generated", "sequenceDependency"], name);
    const identity = oneOf(input.identity, `${name}.identity`, ["none", "always", "by-default"] as const);
    const generated = oneOf(input.generated, `${name}.generated`, ["none", "stored"] as const);
    const sequenceDependency = oneOf(input.sequenceDependency, `${name}.sequenceDependency`, [
        "none",
        "auto",
        "internal",
    ] as const);
    const defaultValue =
        input.default === undefined ? undefined : boundedText(input.default, `${name}.default`, 65_536);
    assertColumnGeneration({ defaultValue, generated, identity, name, sequenceDependency });
    return {
        name: postgresIdentifier(input.name, `${name}.name`),
        type: normalizeProviderType(input.type, `${name}.type`, "supabase"),
        nullable: requiredBoolean(input.nullable, `${name}.nullable`),
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
        identity,
        generated,
        sequenceDependency,
    };
}

function assertColumnGeneration(input: {
    defaultValue: string | undefined;
    generated: ObservedSchemaColumnV1["generated"];
    identity: ObservedSchemaColumnV1["identity"];
    name: string;
    sequenceDependency: ObservedSchemaColumnV1["sequenceDependency"];
}): void {
    if (input.identity !== "none" && (input.defaultValue !== undefined || input.generated !== "none")) {
        throw new IntegrationInputError(input.name, "identity columns cannot have a default or generated expression");
    }
    if (input.identity !== "none" && input.sequenceDependency !== "internal") {
        throw new IntegrationInputError(`${input.name}.sequenceDependency`, "identity columns require internal");
    }
    if (input.identity === "none" && input.sequenceDependency === "internal") {
        throw new IntegrationInputError(`${input.name}.sequenceDependency`, "internal requires an identity mode");
    }
    if (input.generated === "stored" && input.defaultValue === undefined) {
        throw new IntegrationInputError(`${input.name}.default`, "stored generated columns require an expression");
    }
    if (input.sequenceDependency === "auto" && input.defaultValue === undefined) {
        throw new IntegrationInputError(`${input.name}.default`, "automatic sequence dependencies require a default");
    }
}

function relationKind(value: unknown, name: string): ObservedSchemaRelationV1["kind"] {
    return oneOf(value, name, ["table", "partitioned-table", "view", "materialized-view", "foreign-table"] as const);
}

function oneOf<const T extends readonly string[]>(value: unknown, name: string, allowed: T): T[number] {
    const parsed = requiredText(value, name);
    if (!allowed.includes(parsed)) {
        throw new IntegrationInputError(name, `must be one of ${allowed.join(", ")}`);
    }
    return parsed as T[number];
}

function boundedArray<T>(value: unknown, name: string, limit: number, parse: (entry: unknown, name: string) => T): T[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    if (value.length > limit) {
        throw new IntegrationInputError(name, `must not contain more than ${limit} entries`);
    }
    return value.map((entry, index) => parse(entry, `${name}.${index}`));
}

function assertUnique(values: readonly { name: string }[], name: string, label: string): void {
    const names = values.map((entry) => entry.name);
    if (new Set(names).size !== names.length) {
        throw new IntegrationInputError(name, `must not contain duplicate ${label} names`);
    }
}

function stableIdentifier(value: unknown, name: string): string {
    const identifier = requiredText(value, name);
    if (!/^[a-z][a-z0-9-]{0,127}$/.test(identifier)) {
        throw new IntegrationInputError(name, "must be a lowercase stable identifier");
    }
    return identifier;
}

function postgresIdentifier(value: unknown, name: string): string {
    return boundedText(value, name, 63);
}

function boundedText(value: unknown, name: string, maximumBytes: number): string {
    const parsed = requiredText(value, name);
    if (new TextEncoder().encode(parsed).byteLength > maximumBytes) {
        throw new IntegrationInputError(name, `must not exceed ${maximumBytes} UTF-8 bytes`);
    }
    return parsed;
}
