import { createHash } from "node:crypto";
import type { SchemaDescriptor, SchemaField, UlviaSchema } from "ulvia-contracts/interfaces/UlviaSchema";
import { canonicalizeIJson } from "ulvia-contracts/core/protocol/canonical";
import { parseStrictJson } from "ulvia-contracts/core/protocol/json";
import { parseUlviaSchema } from "ulvia-contracts/core/language/schema/parseSchema";
import { validateSchemaValue } from "ulvia-contracts/core/language/schema/validateValue";
import { jsonSchema } from "./admission";
import { containsResolvedSchema } from "./traverse";
import { RESOLVED_SCHEMA_LIMITS, schemaDescriptorOutputSchema } from "./protocol";
export class SchemaResolutionError extends Error {
    constructor(
        readonly code:
            | "INVALID_SELECTOR"
            | "INVALID_SCHEMA_DESCRIPTOR"
            | "SCHEMA_VERSION_CONFLICT"
            | "SCHEMA_RESOLUTION_LIMIT"
            | "SCHEMA_RESOLVER_UNAVAILABLE",
        readonly path = "$",
        options?: ErrorOptions,
    ) {
        super(`Schema resolution refused: ${code} at ${path}`, options);
    }
}
export function schemaDescriptorDigest(schema: UlviaSchema, fields: readonly SchemaField[]): string {
    return `sha256:${createHash("sha256")
        .update(
            canonicalizeIJson({
                schema,
                fields: fields.map(({ id, property, sensitive }) => ({ id, property, sensitive })),
            }),
        )
        .digest("hex")}`;
}
export function parseSchemaDescriptor(value: unknown): SchemaDescriptor {
    try {
        validateSchemaValue(schemaDescriptorOutputSchema, value);
        const wire = value as {
            resourceId: string;
            version: string;
            digest: string;
            schemaJson: string;
            fields: readonly SchemaField[];
        };
        const schema = parseUlviaSchema(
            parseStrictJson(wire.schemaJson, 262144, RESOLVED_SCHEMA_LIMITS.maxJsonDepth),
            RESOLVED_SCHEMA_LIMITS,
        );
        if (!jsonSchema(schema) || containsResolvedSchema(schema)) {
            throw new TypeError("Resolved descriptors must contain concrete JSON schemas");
        }
        if (
            new Set(wire.fields.map(({ id }) => id)).size !== wire.fields.length ||
            new Set(wire.fields.map(({ property }) => property)).size !== wire.fields.length ||
            wire.fields.some(({ property }) => schema.type !== "object" || !Object.hasOwn(schema.properties, property))
        ) {
            throw new TypeError("Invalid schema field identities");
        }
        const digest = schemaDescriptorDigest(schema, wire.fields);
        if (wire.digest !== digest) {
            throw new TypeError("Schema descriptor digest mismatch");
        }
        return {
            resourceId: wire.resourceId,
            version: wire.version,
            digest,
            schema,
            fields: structuredClone(wire.fields),
        };
    } catch (cause) {
        throw new SchemaResolutionError("INVALID_SCHEMA_DESCRIPTOR", "$", { cause });
    }
}
export function schemaDescriptorProjection(descriptor: SchemaDescriptor): UlviaSchema {
    const schema = descriptor.schema;
    if (schema.type !== "object") {
        return schema;
    }
    const hidden = new Set(descriptor.fields.filter(({ sensitive }) => sensitive).map(({ property }) => property));
    const properties = Object.fromEntries(Object.entries(schema.properties).filter(([name]) => !hidden.has(name)));
    const required = schema.required.filter((name) => !hidden.has(name));
    return {
        ...schema,
        properties,
        required,
        ...(schema.minProperties === undefined
            ? {}
            : { minProperties: Math.max(required.length, schema.minProperties - hidden.size) }),
        ...(schema.maxProperties === undefined
            ? {}
            : { maxProperties: Math.min(schema.maxProperties, Object.keys(properties).length) }),
    };
}

/** Standard wire encoding; JSON serialization is never a substitute for native schema validation. */
export function schemaDescriptorWire(value: Omit<SchemaDescriptor, "digest">) {
    const schema = parseUlviaSchema(value.schema, RESOLVED_SCHEMA_LIMITS);
    const wire = {
        resourceId: value.resourceId,
        version: value.version,
        fields: value.fields,
        schemaJson: canonicalizeIJson(schema),
        digest: schemaDescriptorDigest(schema, value.fields),
    };
    parseSchemaDescriptor(wire);
    return wire;
}
