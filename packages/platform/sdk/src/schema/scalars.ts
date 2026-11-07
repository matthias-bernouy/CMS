import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { $ZodTypes } from "zod/v4/core";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import { schemaChecks } from "ulvia-sdk/schema/checks";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function scalarSchema(schema: $ZodTypes, path: string): UlviaSchema {
    const def = schema._zod.def;
    switch (def.type) {
        case "string":
            throw new SdkDefinitionError(
                "Use contractString: native Zod string bounds/formats differ from Ulvia UTF-16 semantics",
                path,
            );
        case "number": {
            let integer = false;
            let minimum: number | undefined;
            let maximum: number | undefined;
            for (const check of schemaChecks(schema, ["greater_than", "less_than", "number_format"], path)) {
                if (check.check === "number_format") {
                    if (check.format !== "safeint" && check.format !== "float64") {
                        throw new SdkDefinitionError(`Unsupported number format ${check.format}`, path);
                    }
                    integer ||= check.format === "safeint";
                } else if (check.check === "greater_than" || check.check === "less_than") {
                    if (!check.inclusive || typeof check.value !== "number") {
                        throw new SdkDefinitionError("Only inclusive numeric bounds are supported", path);
                    }
                    if (check.check === "greater_than") {
                        minimum = Math.max(minimum ?? -Infinity, check.value);
                    } else {
                        maximum = Math.min(maximum ?? Infinity, check.value);
                    }
                }
            }
            return {
                type: integer ? "integer" : "number",
                ...(minimum === undefined ? {} : { minimum }),
                ...(maximum === undefined ? {} : { maximum }),
            };
        }
        case "enum":
        case "literal": {
            schemaChecks(schema, [], path);
            const values = def.type === "enum" ? Object.values(def.entries) : def.values;
            if (values.length > DEFAULT_RELEASE_LIMITS.maxEnumValues) {
                throw new SdkDefinitionError("Too many enum values", path);
            }
            if (!values.length || values.some((value) => typeof value !== "string")) {
                throw new SdkDefinitionError("Only string enums and string literals are representable", path);
            }
            const strings = values as string[];
            return { type: "string", enum: strings, maxLength: Math.max(...strings.map((value) => value.length)) };
        }
        case "boolean":
        case "null":
            schemaChecks(schema, [], path);
            return { type: def.type };
        default:
            throw new SdkDefinitionError(`Unsupported Zod type ${def.type}`, path);
    }
}
