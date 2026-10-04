import type { CollectionDataMigration, CollectionMigrationOperation } from "../../interfaces/CollectionRelease";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import { invalid } from "../errors";
import type { CollectionLimits } from "../limits";
import { parseCollectionBlocTag } from "../namespace";
import { array, identifier, integer, keys, record, string, unique } from "../values";

const OPERATION_KEYS = {
    "rename-bloc": ["kind", "from", "to"],
    "rename-setting": ["kind", "bloc", "from", "to"],
    "set-setting-default": ["kind", "bloc", "setting", "value"],
    "remove-setting": ["kind", "bloc", "setting"],
    "map-setting-value": ["kind", "bloc", "setting", "values"],
    "rename-theme-token": ["kind", "from", "to"],
    "rename-asset": ["kind", "from", "to"],
    "move-configuration-value": ["kind", "from", "to"],
    "set-configuration-default": ["kind", "path", "value"],
    "remove-configuration-value": ["kind", "path"],
    "map-configuration-value": ["kind", "path", "values"],
    "rename-text": ["kind", "from", "to"],
    "remove-text-override": ["kind", "id"],
} as const;

export function parseCollectionMigrations(
    value: unknown,
    collectionId: string,
    dataGeneration: number,
    limits: Readonly<CollectionLimits>,
): readonly CollectionDataMigration[] {
    const migrations = array(value, limits.maxMigrations, "$.migrations").map((item, index) => {
        const path = `$.migrations[${index}]`;
        const source = record(item, path);
        keys(source, ["fromGeneration", "toGeneration", "operations"], path);
        const fromGeneration = integer(source.fromGeneration, 1, Number.MAX_SAFE_INTEGER, `${path}.fromGeneration`);
        const toGeneration = integer(source.toGeneration, 2, Number.MAX_SAFE_INTEGER, `${path}.toGeneration`);
        if (toGeneration !== fromGeneration + 1) {
            invalid("must connect adjacent data generations", `${path}.toGeneration`);
        }
        return {
            fromGeneration,
            toGeneration,
            operations: array(source.operations, limits.maxMigrationOperations, `${path}.operations`).map(
                (operation, offset) => parseOperation(operation, collectionId, `${path}.operations[${offset}]`),
            ),
        };
    });
    unique(
        migrations.map(({ fromGeneration }) => String(fromGeneration)),
        "$.migrations",
    );
    migrations.sort((left, right) => left.fromGeneration - right.fromGeneration);
    if (migrations.length !== Math.max(0, dataGeneration - 1)) {
        invalid("must contain one cumulative adjacent migration from generation 1", "$.migrations");
    }
    migrations.forEach((migration, index) => {
        if (migration.fromGeneration !== index + 1) {
            invalid("must form a contiguous chain starting at generation 1", `$.migrations[${index}]`);
        }
    });
    return migrations;
}

function parseOperation(value: unknown, collectionId: string, path: string): CollectionMigrationOperation {
    const source = record(value, path);
    const kind = source.kind;
    if (typeof kind !== "string" || !Object.hasOwn(OPERATION_KEYS, kind)) {
        invalid("unsupported migration operation", `${path}.kind`);
    }
    keys(source, OPERATION_KEYS[kind as keyof typeof OPERATION_KEYS], path);
    const setting = (field: string) => identifier(source[field], `${path}.${field}`);
    const bloc = (field: string) => parseCollectionBlocTag(source[field], collectionId, `${path}.${field}`);
    switch (kind) {
        case "rename-bloc":
            return { kind, from: bloc("from"), to: bloc("to") };
        case "rename-setting":
            return { kind, bloc: bloc("bloc"), from: setting("from"), to: setting("to") };
        case "set-setting-default":
            return {
                kind,
                bloc: bloc("bloc"),
                setting: setting("setting"),
                value: scalar(source.value, `${path}.value`),
            };
        case "remove-setting":
            return { kind, bloc: bloc("bloc"), setting: setting("setting") };
        case "map-setting-value":
            return {
                kind,
                bloc: bloc("bloc"),
                setting: setting("setting"),
                values: stringMap(source.values, `${path}.values`),
            };
        case "rename-theme-token":
            return { kind, from: setting("from"), to: setting("to") };
        case "rename-asset":
            return { kind, from: asset(source.from, `${path}.from`), to: asset(source.to, `${path}.to`) };
        case "move-configuration-value":
            return { kind, from: pathParts(source.from, `${path}.from`), to: pathParts(source.to, `${path}.to`) };
        case "set-configuration-default":
            return {
                kind,
                path: pathParts(source.path, `${path}.path`),
                value: jsonValue(source.value, `${path}.value`),
            };
        case "remove-configuration-value":
            return { kind, path: pathParts(source.path, `${path}.path`) };
        case "map-configuration-value":
            return {
                kind,
                path: pathParts(source.path, `${path}.path`),
                values: valueMappings(source.values, `${path}.values`),
            };
        case "rename-text":
            return { kind, from: setting("from"), to: setting("to") };
        case "remove-text-override":
            return { kind, id: setting("id") };
        default:
            return invalid("unsupported migration operation", `${path}.kind`);
    }
}

function asset(value: unknown, path: string): string {
    return identifier(value, path);
}

function scalar(value: unknown, path: string): string {
    if (typeof value !== "string" || value.length > 4096) {
        invalid("must be a string of at most 4096 characters", path);
    }
    return value;
}

function stringMap(value: unknown, path: string): Readonly<Record<string, string>> {
    const source = record(value, path);
    if (Object.keys(source).length > 128) {
        invalid("must contain at most 128 entries", path);
    }
    return Object.fromEntries(
        Object.entries(source).map(([key, entry]) => [scalar(key, path), scalar(entry, `${path}.${key}`)]),
    );
}

function pathParts(value: unknown, path: string): readonly string[] {
    const parts = array(value, 32, path).map((item, index) => string(item, 128, `${path}[${index}]`));
    if (parts.length === 0 || parts.some((part) => ["__proto__", "prototype", "constructor"].includes(part))) {
        invalid("must be a nonempty safe object path", path);
    }
    return parts;
}

function valueMappings(value: unknown, path: string): readonly { from: unknown; to: unknown }[] {
    const mappings = array(value, 128, path).map((item, index) => {
        const entryPath = `${path}[${index}]`;
        const source = record(item, entryPath);
        keys(source, ["from", "to"], entryPath);
        return { from: jsonValue(source.from, `${entryPath}.from`), to: jsonValue(source.to, `${entryPath}.to`) };
    });
    unique(
        mappings.map((mapping) => canonicalizeIJson(mapping.from)),
        path,
    );
    return mappings;
}

function jsonValue(value: unknown, path: string): unknown {
    try {
        canonicalizeIJson(value, 32);
        return structuredClone(value);
    } catch (error) {
        invalid(error instanceof Error ? error.message : "must be an I-JSON value", path);
    }
}
