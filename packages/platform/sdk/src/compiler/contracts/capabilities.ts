import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { CapabilitySource } from "ulvia-sdk/interfaces/contracts";
import { compileSchema } from "ulvia-sdk/schema/compile";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function compileCapability(id: string, source: CapabilitySource): CapabilityDefinition {
    const { operation, ...exposure } = source;
    const input = compileSchema(operation.input, `$.capabilities[${JSON.stringify(id)}].input`);
    if (input.type !== "object" || input.nullable) {
        throw new SdkDefinitionError(
            "Capability input must be a nonnullable object",
            `$.capabilities[${JSON.stringify(id)}]`,
        );
    }
    return structuredClone({
        ...exposure,
        id,
        ...(operation.description === undefined ? {} : { description: operation.description }),
        ...(operation.docs === undefined ? {} : { docs: operation.docs }),
        ...(operation.mocks === undefined ? {} : { mocks: operation.mocks }),
        input,
        output: compileSchema(operation.output, `$.capabilities[${JSON.stringify(id)}].output`),
        errors: Object.entries(operation.errors).map(([code, error]) => ({
            code,
            retryable: error.retryable,
            ...(error.description === undefined ? {} : { description: error.description }),
            ...(error.output === undefined
                ? {}
                : {
                      output: compileSchema(
                          error.output,
                          `$.capabilities[${JSON.stringify(id)}].errors[${JSON.stringify(code)}]`,
                      ),
                  }),
        })),
    });
}
