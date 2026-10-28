import { registerCapabilityDescription } from "./providers/describe";
import { registerContractUpgradeCapabilities } from "./providers/upgrades";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { ProviderOperationExecutor } from "../../operations/ProviderOperationExecutor";
import type { CmsCollectionDependencies, UlviaProviderGateway, UlviaProviderManagement } from "../../ports";
import { registerCollectionInstallationCapabilities } from "./collections";
import { registerProviderInstallationCapabilities } from "./providers";
import type { CollectionSources } from "./sources";

export function registerInstallationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsCollectionDependencies,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
    management?: UlviaProviderManagement,
    sources?: CollectionSources,
): void {
    registerCapabilityDescription(dispatcher, gateway);
    registerCollectionInstallationCapabilities(dispatcher, dependencies, operations, sources);
    registerProviderInstallationCapabilities(dispatcher, gateway, management);
    registerContractUpgradeCapabilities(dispatcher, gateway, operations);
}

export { registerCollectionInstallationCapabilities } from "./collections";
export { registerCollectionOperationCapabilities } from "./operations";
export { registerProviderInstallationCapabilities } from "./providers";
export { CollectionSources } from "./sources";
