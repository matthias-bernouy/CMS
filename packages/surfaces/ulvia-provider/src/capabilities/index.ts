import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports";
import { registerAccessCapabilities } from "./access";
import { registerContentCapabilities } from "./content";
import { registerFileCapabilities } from "./files";
import { registerInstallationCapabilities } from "./installations";
import { registerSecretCapabilities } from "./secrets";
import type { CollectionSources } from "./installations/sources";
import type { ProviderOperationExecutor } from "../operations/ProviderOperationExecutor";
import type { CmsFilesService } from "@bernouy/cms-files";

export function registerOfficialProviderCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: UlviaProviderDependencies,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
    providerManagement?: UlviaProviderManagement,
    collectionSources?: CollectionSources,
    files?: CmsFilesService,
    fileWorkspace?: CmsFileWorkspace,
    enabledContractIds?: ReadonlySet<string>,
): void {
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
    if (dependencies.secrets && enabledContractIds?.has("ulvia.cms.secrets")) {
        registerSecretCapabilities(dispatcher, dependencies.secrets);
    }
    registerAccessCapabilities(dispatcher, dependencies, gateway);
}

export {
    registerAccessCapabilities,
    registerContentCapabilities,
    registerFileCapabilities,
    registerInstallationCapabilities,
    registerSecretCapabilities,
};
export {
    CollectionSources,
    registerCollectionInstallationCapabilities,
    registerCollectionOperationCapabilities,
    registerProviderInstallationCapabilities,
} from "./installations";
export type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports";
