import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { OperationSource } from "ulvia-sdk/interfaces/operations";
import { compileSchema } from "ulvia-sdk/schema/compile";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function compileCapability(operation: OperationSource): CapabilityDefinition {
    const { id, access, behavior, bindings, deprecation, responseEffects } = operation;
    const input = compileSchema(operation.input, `$.operations[${JSON.stringify(id)}].input`);
    if (input.type !== "object" || input.nullable) {
        throw new SdkDefinitionError(
            "Operation input must be a nonnullable object",
            `$.operations[${JSON.stringify(id)}]`,
        );
    }
    return structuredClone({
        id,
        access,
        behavior,
        bindings,
        ...(deprecation === undefined ? {} : { deprecation }),
        ...(responseEffects === undefined ? {} : { responseEffects }),
        ...(operation.description === undefined ? {} : { description: operation.description }),
        ...(operation.docs === undefined ? {} : { docs: operation.docs }),
        ...(operation.mocks === undefined ? {} : { mocks: operation.mocks }),
        input,
        output: compileSchema(operation.output, `$.operations[${JSON.stringify(id)}].output`),
        errors: Object.entries(operation.errors).map(([code, error]) => ({
            code,
            retryable: error.retryable,
            ...(error.description === undefined ? {} : { description: error.description }),
            ...(error.output === undefined
                ? {}
                : {
                      output: compileSchema(
                          error.output,
                          `$.operations[${JSON.stringify(id)}].errors[${JSON.stringify(code)}]`,
                      ),
                  }),
        })),
    });
}
