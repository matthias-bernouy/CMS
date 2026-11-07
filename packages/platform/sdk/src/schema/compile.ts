import type { z } from "zod";
import { parseUlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import { SchemaCompiler } from "ulvia-sdk/schema/visit";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** Compile a JSON wire schema. Unsupported checks never fall back to an unconstrained schema. */
export function compileSchema(source: z.ZodType, path = "$"): UlviaSchema {
    const result = new SchemaCompiler().visit(source, path);
    if (result.optional) {
        throw new SdkDefinitionError("Optional schemas are only supported as object properties", path);
    }
    try {
        return parseUlviaSchema(result.schema);
    } catch (error) {
        throw new SdkDefinitionError(error instanceof Error ? error.message : "Invalid Ulvia schema", path);
    }
}
