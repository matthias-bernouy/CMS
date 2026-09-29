import { parseUlviaSchema, validateSchemaValue, type UlviaSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionConfiguration } from "../../interfaces/CollectionRelease";
import { invalid, translateCollectionError } from "../errors";
import type { CollectionLimits } from "../limits";
import { keys, record } from "../values";

export function parseConfiguration(
    value: unknown,
    path: string,
    limits: Readonly<CollectionLimits>,
): CollectionConfiguration {
    const source = record(value, path);
    keys(source, ["schema", "defaults"], path);
    let schema: UlviaSchema;
    try {
        schema = parseUlviaSchema(source.schema, limits.schema);
    } catch (error) {
        return translateCollectionError(error, `${path}.schema`);
    }
    if (schema.type !== "object" || schema.nullable) {
        invalid("configuration must have a nonnullable object schema", `${path}.schema`);
    }
    assertJsonConfiguration(schema, `${path}.schema`);
    const defaults = record(source.defaults, `${path}.defaults`);
    try {
        validateSchemaValue(schema, defaults);
    } catch (error) {
        invalid(`invalid defaults: ${error instanceof Error ? error.message : "schema mismatch"}`, `${path}.defaults`);
    }
    return { schema, defaults };
}

function assertJsonConfiguration(schema: UlviaSchema, path: string): void {
    if (schema.type === "binary") {
        invalid("configuration must use JSON values, not binary leaves", path);
    }
    if (schema.type === "object") {
        for (const [key, child] of Object.entries(schema.properties)) {
            assertJsonConfiguration(child, `${path}.properties.${key}`);
        }
    } else if (schema.type === "array") {
        assertJsonConfiguration(schema.items, `${path}.items`);
    } else if (schema.type === "map") {
        assertJsonConfiguration(schema.values, `${path}.values`);
    }
}
