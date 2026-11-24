import { DEFAULT_RELEASE_LIMITS } from "ulvia-contracts/core/protocol/limits";
import type { UlviaObjectSchema } from "ulvia-contracts/interfaces/UlviaSchema";
export const RESOLVED_SCHEMA_LIMITS = Object.freeze({
    ...DEFAULT_RELEASE_LIMITS,
    maxProperties: 8192,
    maxEnumValues: 8192,
    maxSchemaNodes: 32768,
});
const id = { type: "string", minLength: 1, maxLength: 128 } as const;
export const schemaResolverInputSchema = {
    type: "object",
    properties: { selectorJson: { type: "string", maxLength: 16384, sensitive: true }, version: id },
    required: ["selectorJson"],
} as const satisfies UlviaObjectSchema;
export const schemaDescriptorOutputSchema = {
    type: "object",
    properties: {
        resourceId: id,
        version: id,
        schemaJson: { type: "string", maxLength: 262144 },
        digest: { type: "string", minLength: 71, maxLength: 71 },
        fields: {
            type: "array",
            maxItems: 8192,
            items: {
                type: "object",
                properties: {
                    id: { type: "string", minLength: 1, maxLength: 64 },
                    property: { type: "string", minLength: 1, maxLength: 64 },
                    label: { type: "string", minLength: 1, maxLength: 65536 },
                    sensitive: { type: "boolean" },
                },
                required: ["id", "property", "label", "sensitive"],
            },
        },
    },
    required: ["resourceId", "version", "schemaJson", "digest", "fields"],
} as const satisfies UlviaObjectSchema;

export const schemaChoicesInputSchema = {
    type: "object",
    properties: { cursor: { type: "string", maxLength: 2048 }, limit: { type: "integer", minimum: 1, maximum: 100 } },
    required: ["limit"],
} as const satisfies UlviaObjectSchema;
export const schemaChoicesOutputSchema = {
    type: "object",
    properties: {
        items: {
            type: "array",
            maxItems: 100,
            items: {
                type: "object",
                properties: {
                    selectorJson: { type: "string", maxLength: 16384, sensitive: true },
                    label: { type: "string", maxLength: 512 },
                    available: { type: "boolean" },
                },
                required: ["selectorJson", "label", "available"],
            },
        },
        nextCursor: { type: "string", maxLength: 2048 },
    },
    required: ["items"],
} as const satisfies UlviaObjectSchema;
