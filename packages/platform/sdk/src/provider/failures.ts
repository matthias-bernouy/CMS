import { ProviderCapabilityDispatchError } from "@bernouy/cms-gateway/provider/server";
import type { ProviderRoute } from "@bernouy/cms-gateway/provider/server";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { CapabilityFailure } from "ulvia-sdk/definitions/errors";
import type { ProviderRegistrationOptions, CapabilityFailurePresentationContext } from "ulvia-sdk/interfaces/runtime";

/** The admitted binding owns status selection; a host may format only the declared payload and presentation. */
export function presentCapabilityFailure(
    failure: CapabilityFailure,
    capability: CapabilityDefinition,
    route: ProviderRoute,
    options: ProviderRegistrationOptions,
    invocation: CapabilityFailurePresentationContext["invocation"],
): ProviderCapabilityDispatchError {
    const declaration = capability.errors.find(({ code }) => code === failure.code);
    if (!declaration) {
        throw new TypeError("Handler threw an undeclared capability error");
    }
    const validate = (output: unknown) => {
        if (declaration.output) {
            validateSchemaValue(declaration.output, output);
        } else if (output !== undefined) {
            throw new TypeError("Undeclared capability error payload");
        }
    };
    validate(failure.output);
    const status = route.capability.binding.response.errorStatuses[failure.code];
    if (status === undefined) {
        throw new TypeError("Capability error has no admitted HTTP status");
    }
    const formatted = options.formatCapabilityFailure?.(failure, { contractId: route.contractId, status, invocation });
    if (formatted) {
        validate(formatted.output);
    }
    return new ProviderCapabilityDispatchError(
        failure.code,
        status,
        failure.code,
        formatted?.responseHeaders ?? {},
        formatted ? formatted.output : failure.output,
        formatted?.reason,
    );
}
