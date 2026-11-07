import type { ContractDefinition } from "ulvia-sdk/interfaces/contracts";
import type {
    ContractImplementation,
    HandlerFactories,
    ImplementationOptions,
    ProviderDefinition,
} from "ulvia-sdk/interfaces/providers";

export function implementContract<const Contract extends ContractDefinition, Dependencies>(
    contract: Contract,
    handlers: HandlerFactories<NoInfer<Contract>, Dependencies> &
        Readonly<Record<string, (dependencies: Dependencies) => unknown>>,
    options: ImplementationOptions = {},
): ContractImplementation<Dependencies> {
    return Object.freeze({ ...options, contract, handlers: Object.freeze({ ...handlers }) });
}

export function defineProvider<Dependencies>(
    definition: ProviderDefinition<Dependencies>,
): ProviderDefinition<Dependencies> {
    return Object.freeze({ ...definition, implementations: Object.freeze([...definition.implementations]) });
}
