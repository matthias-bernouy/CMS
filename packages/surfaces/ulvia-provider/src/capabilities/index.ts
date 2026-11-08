import { createProviderOperationAdapter } from "./features/services/operations";
import { repositoryAccountResolver } from "./features/services/repository";
import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type { UlviaProviderDependencies, UlviaProviderGateway, UlviaProviderManagement } from "../ports/index";
import { createContentContributions } from "./features/services/content";
import { registerOfficialFeatures } from "./features";
import { registerInstallationCapabilities } from "./installations/index";
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
    registerInstallationCapabilities(
        dispatcher,
        dependencies,
        gateway,
        operations,
        providerManagement,
        collectionSources,
    );
    if (enabledContracts) {
        await registerOfficialFeatures(
            dispatcher,
            {
                ...dependencies,
                governance: gateway,
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

export { registerOfficialFeatures, registerInstallationCapabilities };
export type { UlviaProviderFeatureServices } from "../ports/index";
export {
    CollectionSources,
    registerCollectionInstallationCapabilities,
    registerCollectionOperationCapabilities,
    registerProviderInstallationCapabilities,
} from "./installations/index";
export type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports/index";

import type { ImplementationRelease, ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";
