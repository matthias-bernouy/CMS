export {
    ProviderCapabilityResponse,
    capabilityResponse,
    ProviderCapabilityDispatchError,
    type ProviderCapabilityInvocationContext,
    type ProviderBinaryResult,
    type ProviderCapabilityHandler,
    type ProviderCapabilityDispatcher,
    type ProviderCapabilityRegistry,
} from "@bernouy/cms-gateway/provider/server";

import {
    DefaultProviderCapabilityDispatcher as GenericDispatcher,
    ProviderCapabilityDispatchError,
} from "@bernouy/cms-gateway/provider/server";
import type { ProviderCapabilityHandler } from "@bernouy/cms-gateway/provider/server";
import { localizeOfficialError } from "./errors/localize";

/** Official copy is separate from the provider-neutral SDK and contract schemas. */
export class DefaultProviderCapabilityDispatcher extends GenericDispatcher {
    override register(contractId: string, capabilityId: string, handler: ProviderCapabilityHandler): void {
        super.register(contractId, capabilityId, async (input, context) => {
            try {
                return await handler(input, context);
            } catch (error) {
                if (error instanceof ProviderCapabilityDispatchError) {
                    throw localizeOfficialError(error, contractId, capabilityId, context);
                }
                throw error;
            }
        });
    }
}
