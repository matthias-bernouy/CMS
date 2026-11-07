import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports/index";
import { registerObservabilityCapabilities } from "./observability/index";
import { registerAccessCapabilities } from "./access/index";
import { registerContentCapabilities } from "./content/index";
import { registerFileCapabilities } from "./storage/files";
import { registerOfficialFeatures } from "./features";
import { registerAuthoringCapabilities } from "./installations/authoring/index";
import { registerInstallationCapabilities } from "./installations/index";
import type { CollectionSources } from "./installations/sources/index";
import type { ProviderOperationExecutor } from "../operations/ProviderOperationExecutor";
import type { CmsFilesService } from "@bernouy/cms-files";

export async function registerOfficialProviderCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: UlviaProviderDependencies,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
    providerManagement?: UlviaProviderManagement,
    collectionSources?: CollectionSources,
    files?: CmsFilesService,
    fileWorkspace?: CmsFileWorkspace,
    enabledContracts?: readonly ImplementationRelease[],
    featureOptions?: ProviderRegistrationOptions,
): Promise<void> {
    const enabledContractIds = new Set(enabledContracts?.map(({ contractId }) => contractId));
    if (enabledContractIds.has("ulvia/cms.authoring")) {
        registerAuthoringCapabilities(dispatcher, dependencies.authoring);
    }
    if (dependencies.observability && enabledContractIds.has("ulvia/cms.observability")) {
        registerObservabilityCapabilities(dispatcher, dependencies.observability);
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
    if (files) {
        registerFileCapabilities(dispatcher, files, fileWorkspace);
    }
    if (enabledContracts) {
        await registerOfficialFeatures(dispatcher, dependencies, enabledContracts, featureOptions);
    }
    registerAccessCapabilities(dispatcher, dependencies, gateway);
}

export { loadOfficialFeatures } from "./features";

export {
    registerAccessCapabilities,
    registerObservabilityCapabilities,
    registerContentCapabilities,
    registerOfficialFeatures,
    registerFileCapabilities,
    registerInstallationCapabilities,
};
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
