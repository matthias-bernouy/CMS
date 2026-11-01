import type { CapabilityErrorDefinition } from "@bernouy/cms-repository/contracts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { ProviderCapabilityDispatchError } from "../dispatch/registry";
import type { ProviderOperationHandler } from "./types";

/** Error details have the same declared-schema requirement as synchronous failures. */
export function validatedOperationHandler(
    handler: ProviderOperationHandler,
    errors: readonly CapabilityErrorDefinition[],
): ProviderOperationHandler {
    return async (...args) => {
        try {
            return await handler(...args);
        } catch (error) {
            if (error instanceof ProviderCapabilityDispatchError) {
                const definition = errors.find((candidate) => candidate.code === error.code);
                if (errors.length && !definition) {
                    throw new TypeError("Operation returned an undeclared error code");
                }
                const schema = definition?.output;
                if (!schema && error.output !== undefined) {
                    throw new TypeError("Operation returned undeclared error details");
                }
                if (schema) {
                    validateSchemaValue(schema, error.output);
                }
            }
            throw error;
        }
    };
}
