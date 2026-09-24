import { ReleaseValidationError } from "@bernouy/cms-contracts";
import { parseUlviaSchema, type UlviaObjectSchema, type UlviaSchema } from "@bernouy/cms-contracts/schema";
import { translateContractError } from "../contractErrors";
import { ProviderManifestValidationError } from "../errors";

export function parseConfiguration(value: unknown, path: string): UlviaObjectSchema {
    let schema: UlviaSchema;
    try {
        schema = parseUlviaSchema(value);
    } catch (error) {
        if (error instanceof ReleaseValidationError) {
            translateContractError(error, path);
        }
        throw error;
    }
    if (schema.type !== "object" || schema.nullable) {
        throw new ProviderManifestValidationError(
            "invalid_schema",
            "configuration must be a non-nullable object schema",
            path,
        );
    }
    assertJsonConfiguration(schema, path);
    return schema;
}

function assertJsonConfiguration(schema: UlviaSchema, path: string): void {
    switch (schema.type) {
        case "binary":
            throw new ProviderManifestValidationError(
                "invalid_schema",
                "configuration cannot contain binary values",
                path,
            );
        case "array":
            assertJsonConfiguration(schema.items, `${path}.items`);
            return;
        case "map":
            assertJsonConfiguration(schema.values, `${path}.values`);
            return;
        case "object":
            for (const [name, property] of Object.entries(schema.properties)) {
                assertJsonConfiguration(property, `${path}.properties.${name}`);
            }
            return;
        default:
            return;
    }
}
