import { ReleaseValidationError } from "../../protocol/errors";
import { assertJsonCompatible } from "../../bindings/jsonCompatibility";
import type { CapabilityErrorDefinition } from "../../../interfaces/ContractRelease";
import type { UlviaObjectSchema, UlviaSchema } from "../../../interfaces/UlviaSchema";

/** MCP maps at most one root binary property to a host-resolved resource handle. */
export function validateMcpSchemas(
    input: UlviaObjectSchema,
    output: UlviaSchema,
    errors: readonly CapabilityErrorDefinition[],
    path: string,
): void {
    let binaries = 0;
    for (const [name, schema] of Object.entries(input.properties)) {
        if (schema.type === "binary") {
            binaries++;
            if (binaries > 1 || schema.nullable) {
                throw new ReleaseValidationError(
                    "invalid_binding",
                    "MCP supports at most one non-nullable binary input property",
                    `${path}.input.${name}`,
                );
            }
        } else {
            assertJsonCompatible(schema, `${path}.input.${name}`);
        }
    }
    if (output.type !== "binary") {
        assertJsonCompatible(output, `${path}.output`);
    }
    for (const error of errors) {
        if (error.output) {
            assertJsonCompatible(error.output, `${path}.errors.${error.code}`);
        }
    }
}
