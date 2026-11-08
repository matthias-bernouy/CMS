import { createResourceOperationQuery } from "./features/services/resources";
import { createInstallationOperationQueries } from "./features/services/installations/operations";
import { createProviderOperationAdapter } from "./features/services/operations";
import { repositoryAccountResolver } from "./features/services/repository";
import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type { UlviaProviderDependencies, UlviaProviderGateway, UlviaProviderManagement } from "../ports/index";
import { createContentContributions } from "./features/services/content";
import { registerOfficialFeatures } from "./features";
import type { CollectionSources } from "./installations/sources/index";
import type { ProviderOperationExecutor } from "../operations/ProviderOperationExecutor";

export async function registerOfficialProviderCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: UlviaProviderDependencies,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
    providerManagement?: UlviaProviderManagement,
    collectionSources?: CollectionSources,
    enabledContracts?: readonly ImplementationRelease[],
    featureOptions?: ProviderRegistrationOptions,
): Promise<void> {
    if (enabledContracts) {
        await registerOfficialFeatures(
            dispatcher,
            {
                ...dependencies,
                resources:
                    dependencies.resources && operations
                        ? { ...dependencies.resources, operation: createResourceOperationQuery(operations) }
                        : undefined,
                governance: gateway,
                gateway,
                management: providerManagement,
                sources: collectionSources,
                discovery: dependencies.repositoryDiscovery,
                operations: operations ? createInstallationOperationQueries(operations) : undefined,
                resolveRepositoryAccount:
                    dependencies.resolveRepositoryAccount ?? (gateway ? repositoryAccountResolver(gateway) : undefined),
                contributions: dependencies.collections ? createContentContributions(dependencies) : undefined,
            },
            enabledContracts,
            featureOptions
                ? {
                      ...featureOptions,
                      operations:
                          featureOptions.operations ??
                          (operations ? createProviderOperationAdapter(operations) : undefined),
                  }
                : featureOptions,
        );
    }
}

export { loadOfficialFeatures } from "./features";

export { registerOfficialFeatures };
export type { UlviaProviderFeatureServices } from "../ports/index";
export { CollectionSources } from "./installations/sources/index";
export type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports/index";

import type { ImplementationRelease, ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";
