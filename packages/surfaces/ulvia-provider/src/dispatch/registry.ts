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
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import { localizeOfficialError } from "./errors/localize";

/** Official copy is separate from the provider-neutral SDK and contract schemas. */
export class DefaultProviderCapabilityDispatcher extends GenericDispatcher {
    private readonly expected?: ReadonlySet<string>;
    private closed = false;

    constructor(contracts?: readonly ResolvedContract[]) {
        super();
        this.expected = contracts
            ? new Set(
                  contracts.flatMap((contract) =>
                      contract.capabilities.map(({ definition }) => `${contract.release.contractId}\0${definition.id}`),
                  ),
              )
            : undefined;
    }

    override seal(contracts: readonly ResolvedContract[]): void {
        super.seal(contracts);
        this.closed = true;
    }

    override register(contractId: string, capabilityId: string, handler: ProviderCapabilityHandler): void {
        if (this.closed) {
            throw new Error("The Provider capability registry is already sealed.");
        }
        if (this.expected && !this.expected.has(`${contractId}\0${capabilityId}`)) {
            return;
        }
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
