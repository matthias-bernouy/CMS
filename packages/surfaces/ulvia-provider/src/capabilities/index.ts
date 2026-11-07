import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type { UlviaProviderDependencies, UlviaProviderGateway, UlviaProviderManagement } from "../ports/index";
import { registerContentCapabilities } from "./content/index";
import { registerOfficialFeatures } from "./features";
import { registerAuthoringCapabilities } from "./installations/authoring/index";
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
    const enabledContractIds = new Set(enabledContracts?.map(({ contractId }) => contractId));
    if (enabledContractIds.has("ulvia/cms.authoring")) {
        registerAuthoringCapabilities(dispatcher, dependencies.authoring);
    }
    registerContentCapabilities(dispatcher, dependencies);
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
            { ...dependencies, governance: gateway },
            enabledContracts,
            featureOptions,
        );
    }
}

export { loadOfficialFeatures } from "./features";

export { registerContentCapabilities, registerOfficialFeatures, registerInstallationCapabilities };
export type { UlviaProviderFeatureServices } from "../ports/index";
export { registerRepositoryCapabilities } from "./registry";
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
