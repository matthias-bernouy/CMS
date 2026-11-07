import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";
import { compileSchema } from "ulvia-sdk/schema/compile";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function compileCapability(capability: CapabilitySource): CapabilityDefinition {
    const { id, access, behavior, bindings, deprecation, responseEffects } = capability;
    const input = compileSchema(capability.input, `$.capabilities[${JSON.stringify(id)}].input`);
    if (input.type !== "object" || input.nullable) {
        throw new SdkDefinitionError(
            "Capability input must be a nonnullable object",
            `$.capabilities[${JSON.stringify(id)}]`,
        );
    }
    return structuredClone({
        id,
        access,
        behavior,
        bindings,
        ...(deprecation === undefined ? {} : { deprecation }),
        ...(responseEffects === undefined ? {} : { responseEffects }),
        ...(capability.description === undefined ? {} : { description: capability.description }),
        ...(capability.docs === undefined ? {} : { docs: capability.docs }),
        ...(capability.mocks === undefined ? {} : { mocks: capability.mocks }),
        input,
        output: compileSchema(capability.output, `$.capabilities[${JSON.stringify(id)}].output`),
        errors: Object.entries(capability.errors).map(([code, error]) => ({
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
