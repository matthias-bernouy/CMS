import { registerRepositoryDiscoveryCapabilities } from "./providers/discovery";
import { registerDocumentationCapabilities } from "./providers/documentation";
import { registerCapabilityDescription } from "./providers/describe";
import { registerContractUpgradeCapabilities } from "./providers/upgrades";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { ProviderOperationExecutor } from "../../operations/ProviderOperationExecutor";
import type { CmsCollectionDependencies, UlviaProviderGateway, UlviaProviderManagement } from "../../ports/index";
import { registerCollectionInstallationCapabilities } from "./collections";
import { registerProviderInstallationCapabilities } from "./providers/index";
import type { CollectionSources } from "./sources/index";

export function registerInstallationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsCollectionDependencies,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
    management?: UlviaProviderManagement,
    sources?: CollectionSources,
): void {
    registerCapabilityDescription(dispatcher, gateway);
    registerDocumentationCapabilities(dispatcher, dependencies.documentation);
    registerRepositoryDiscoveryCapabilities(dispatcher, dependencies.repositoryDiscovery);
    registerCollectionInstallationCapabilities(dispatcher, dependencies, operations, sources);
    registerProviderInstallationCapabilities(dispatcher, gateway, management);
    registerContractUpgradeCapabilities(dispatcher, gateway, operations);
}

export { registerCollectionInstallationCapabilities } from "./collections";
export { registerCollectionOperationCapabilities } from "./operations";
export { registerProviderInstallationCapabilities } from "./providers/index";
export { CollectionSources } from "./sources/index";
