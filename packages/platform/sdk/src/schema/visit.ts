import { z } from "zod";
import type { $ZodType, $ZodTypes } from "zod/v4/core";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import { schemaChecks, lengthBounds } from "ulvia-sdk/schema/checks";
import { scalarSchema } from "ulvia-sdk/schema/scalars";
import { registeredSchema } from "ulvia-sdk/schema/adapters";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

interface SchemaNode {
    schema: UlviaSchema;
    optional: boolean;
}

/** Zod's documented core visitor API: https://zod.dev/packages/core */
export class SchemaCompiler {
    private nodes = 0;

    private accountForRegistered(schema: UlviaSchema, path: string, depth: number): void {
        const children =
            schema.type === "object"
                ? Object.values(schema.properties)
                : schema.type === "array"
                  ? [schema.items]
                  : schema.type === "map"
                    ? [schema.values]
                    : [];
        for (const child of children) {
            this.nodes += 1;
            if (
                depth + 1 > DEFAULT_RELEASE_LIMITS.maxSchemaDepth ||
                this.nodes > DEFAULT_RELEASE_LIMITS.maxSchemaNodes
            ) {
                throw new SdkDefinitionError("Registered schema exceeds the compilation budget", path);
            }
            this.accountForRegistered(child, path, depth + 1);
        }
    }

    visit(source: $ZodType, path: string, depth = 1): SchemaNode {
        this.nodes += 1;
        if (depth > DEFAULT_RELEASE_LIMITS.maxSchemaDepth || this.nodes > DEFAULT_RELEASE_LIMITS.maxSchemaNodes) {
            throw new SdkDefinitionError("Schema exceeds the compilation depth or node budget", path);
        }
        const known = registeredSchema(source);
        if (known) {
            this.accountForRegistered(known, path, depth);
            const description = z.globalRegistry.get(source)?.description;
            return { schema: description === undefined ? known : { ...known, description }, optional: false };
        }
        const schema = source as $ZodTypes;
        const def = schema._zod.def;
        if ("coerce" in def && def.coerce) {
            throw new SdkDefinitionError("Coercion cannot be represented in a contract", path);
        }
        let result: SchemaNode;
        switch (def.type) {
            case "optional":
            case "nullable": {
                schemaChecks(schema, [], path);
                result = this.visit(def.innerType, path, depth + 1);
                if (def.type === "optional") {
                    result.optional = true;
                } else if (result.schema.type !== "null") {
                    result.schema = { ...result.schema, nullable: true };
                }
                break;
            }
            case "object": {
                schemaChecks(schema, [], path);
                if (def.catchall?._zod.def.type !== "never") {
                    throw new SdkDefinitionError("Objects must use z.strictObject()", path);
                }
                const entries = Object.entries(def.shape);
                if (entries.length > DEFAULT_RELEASE_LIMITS.maxProperties) {
                    throw new SdkDefinitionError("Object has too many properties", path);
                }
                const properties: Record<string, UlviaSchema> = {};
                const required: string[] = [];
                for (const [name, child] of entries) {
                    const parsed = this.visit(child, `${path}.properties[${JSON.stringify(name)}]`, depth + 1);
                    Object.defineProperty(properties, name, { value: parsed.schema, enumerable: true });
                    if (!parsed.optional) {
                        required.push(name);
                    }
                }
                result = { schema: { type: "object", properties, required }, optional: false };
                break;
            }
            case "array": {
                const { minimum, maximum } = lengthBounds(schema, path);
                if (maximum === undefined) {
                    throw new SdkDefinitionError("Arrays require an explicit maximum item count", path);
                }
                const item = this.visit(def.element, `${path}.items`, depth + 1);
                if (item.optional) {
                    throw new SdkDefinitionError("Array items cannot be optional", `${path}.items`);
                }
                result = {
                    schema: {
                        type: "array",
                        items: item.schema,
                        maxItems: maximum,
                        ...(minimum === undefined ? {} : { minItems: minimum }),
                    },
                    optional: false,
                };
                break;
            }
            default:
                result = { schema: scalarSchema(schema, path), optional: false };
        }
        const description = z.globalRegistry.get(source)?.description;
        if (description !== undefined) {
            result.schema = { ...result.schema, description };
        }
        return result;
    }
}
