import { registerRepositoryDiscoveryCapabilities } from "./providers/discovery";
import { registerDocumentationCapabilities } from "./providers/documentation";
import { registerCapabilityDescription } from "./providers/describe";
import { registerContractUpgradeCapabilities } from "./providers/upgrades";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { ProviderOperationExecutor } from "../../operations/ProviderOperationExecutor";
import type { CmsCollectionDependencies, UlviaProviderGateway, UlviaProviderManagement } from "../../ports";
import { registerCollectionInstallationCapabilities } from "./collections";
import { registerProviderInstallationCapabilities } from "./providers";
import type { CollectionSources } from "./sources";
import { registerInitializationCapabilities } from "./initialization";

export function registerInstallationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsCollectionDependencies,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
    management?: UlviaProviderManagement,
    sources?: CollectionSources,
): void {
    registerInitializationCapabilities(dispatcher, dependencies.initialization, operations, gateway);
    registerCapabilityDescription(dispatcher, gateway);
    registerDocumentationCapabilities(dispatcher, dependencies.documentation);
    registerRepositoryDiscoveryCapabilities(dispatcher, dependencies.repositoryDiscovery);
    registerCollectionInstallationCapabilities(dispatcher, dependencies, operations, sources);
    registerProviderInstallationCapabilities(dispatcher, gateway, management);
    registerContractUpgradeCapabilities(dispatcher, gateway, operations);
}

export { registerCollectionInstallationCapabilities } from "./collections";
export { registerCollectionOperationCapabilities } from "./operations";
export { registerProviderInstallationCapabilities } from "./providers";
export { CollectionSources } from "./sources";
