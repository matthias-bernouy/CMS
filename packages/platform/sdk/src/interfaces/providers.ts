import type { z } from "zod";
import type {
    ProviderManifest,
    ProviderCapabilityRequirement,
    ProviderDelegationPolicy,
    ProviderRecoveryPolicy,
    AdmittedProviderManifest,
} from "@bernouy/ulvia-providers";
import type { AdmittedContractRelease, ResolvedContract } from "@bernouy/ulvia-contracts";
import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import type { ContractHandlers } from "ulvia-sdk/interfaces/handlers";

export interface ProviderRequirement extends Omit<ProviderCapabilityRequirement, "versionRange"> {
    readonly versionRange: string;
}

export interface ImplementationOptions {
    readonly requires?: readonly ProviderRequirement[];
    readonly delegation?: ProviderDelegationPolicy;
}

export interface ContractImplementation<Dependencies> extends ImplementationOptions {
    readonly feature: FeatureDefinition;
    /** These factories are captured at build time and invoked only at runtime. */
    readonly handlers: Readonly<Record<string, (dependencies: Dependencies) => unknown>>;
}

export type HandlerFactories<Feature extends FeatureDefinition, Dependencies> = {
    readonly [Id in keyof ContractHandlers<Feature>]: (dependencies: Dependencies) => ContractHandlers<Feature>[Id];
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
    readonly dependencies?: readonly FeatureDefinition[];
}

declare const compiledProvider: unique symbol;
export interface CompiledImplementations<Dependencies> {
    readonly [compiledProvider]: Dependencies;
    readonly implementations: ProviderManifest["implementations"];
    readonly contracts: readonly AdmittedContractRelease[];
    readonly implementedContracts: readonly ResolvedContract[];
}

export interface CompiledProvider<Dependencies> extends CompiledImplementations<Dependencies> {
    readonly manifest: AdmittedProviderManifest;
}
