import type { UlviaSchema } from "@bernouy/cms-repository/contracts/schema";

export type McpJsonSchema = Record<string, unknown>;

/** Discovery projection only: the Gateway remains authoritative for the Ulvia dialect. */
export function mcpSchema(schema: UlviaSchema): McpJsonSchema {
    const { nullable, description, ...shape } = schema as UlviaSchema & { nullable?: true };
    let result: McpJsonSchema;
    switch (shape.type) {
        case "binary":
            result = {
                type: "string",
                format: "uri",
                maxLength: 2_048,
                description: "Host-authorized binary resource URI",
            };
            break;
        case "map":
            result = {
                type: "object",
                additionalProperties: mcpSchema(shape.values),
                propertyNames: { maxLength: shape.maxKeyLength },
                maxProperties: shape.maxProperties,
                ...(shape.minProperties !== undefined ? { minProperties: shape.minProperties } : {}),
            };
            break;
        case "object":
            result = {
                type: "object",
                additionalProperties: false,
                required: shape.required,
                properties: Object.fromEntries(
                    Object.entries(shape.properties).map(([key, value]) => [key, mcpSchema(value)]),
                ),
                ...(shape.minProperties !== undefined ? { minProperties: shape.minProperties } : {}),
                ...(shape.maxProperties !== undefined ? { maxProperties: shape.maxProperties } : {}),
            };
            break;
        case "array":
            result = { ...shape, items: mcpSchema(shape.items) };
            break;
        case "string": {
            const { sensitive: _sensitive, minLength, ...rest } = shape;
            // JSON Schema counts Unicode code points; Ulvia counts UTF-16 code units.
            result = { ...rest, ...(minLength === undefined ? {} : { minLength: Math.ceil(minLength / 2) }) };
            break;
        }
        default:
            result = { ...shape };
    }
    if (description) {
        result.description = description;
    }
    return nullable ? { anyOf: [result, { type: "null" }] } : result;
}

export function closedObject(properties: Record<string, unknown>, required = Object.keys(properties)): McpJsonSchema {
    return { type: "object", properties, required, additionalProperties: false };
}
