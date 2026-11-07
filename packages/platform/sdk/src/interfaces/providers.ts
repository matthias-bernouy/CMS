import type { z } from "zod";
import type {
    ProviderManifest,
    ProviderCapabilityRequirement,
    ProviderDelegationPolicy,
    ProviderRecoveryPolicy,
    AdmittedProviderManifest,
} from "@bernouy/ulvia-providers";
import type { AdmittedContractRelease, ResolvedContract } from "@bernouy/ulvia-contracts";
import type { ContractDefinition } from "ulvia-sdk/interfaces/contracts";
import type { ContractHandlers } from "ulvia-sdk/interfaces/handlers";

export interface ProviderRequirement extends Omit<ProviderCapabilityRequirement, "versionRange"> {
    readonly versionRange: string;
}

export interface ImplementationOptions {
    readonly requires?: readonly ProviderRequirement[];
    readonly delegation?: ProviderDelegationPolicy;
}

export interface ContractImplementation<Dependencies> extends ImplementationOptions {
    readonly contract: ContractDefinition;
    /** These factories are captured at build time and invoked only at runtime. */
    readonly handlers: Readonly<Record<string, (dependencies: Dependencies) => unknown>>;
}

export type HandlerFactories<Contract extends ContractDefinition, Dependencies> = {
    readonly [Id in keyof ContractHandlers<Contract>]: (dependencies: Dependencies) => ContractHandlers<Contract>[Id];
};

export interface ProviderDefinition<Dependencies>
    extends Omit<
        ProviderManifest,
        | "kind"
        | "protocol"
        | "schemaDialect"
        | "configuration"
        | "implementations"
        | "buildVersionRange"
        | "requires"
        | "recovery"
    > {
    readonly buildVersionRange: string;
    readonly requires: readonly ProviderRequirement[];
    readonly recovery?: Omit<ProviderRecoveryPolicy, "compatibleBuildRange"> & {
        readonly compatibleBuildRange: string;
    };
    readonly configuration: z.ZodObject;
    readonly implementations: readonly ContractImplementation<Dependencies>[];
    /** Definitions needed to satisfy requirements without claiming to implement them. */
    readonly dependencies?: readonly ContractDefinition[];
}

declare const compiledProvider: unique symbol;
export interface CompiledProvider<Dependencies> {
    readonly [compiledProvider]: Dependencies;
    readonly manifest: AdmittedProviderManifest;
    readonly contracts: readonly AdmittedContractRelease[];
    readonly implementedContracts: readonly ResolvedContract[];
}
