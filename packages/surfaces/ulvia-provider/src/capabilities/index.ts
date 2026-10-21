import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports";
import { registerAccessCapabilities } from "./access";
import { registerCollectionCapabilities } from "./collections";
import { registerContentCapabilities } from "./content";
import { registerFileCapabilities } from "./files";
import { registerProviderCapabilities } from "./providers";
import type { CollectionSources } from "./collections/sources";
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
): void {
    registerContentCapabilities(dispatcher, dependencies);
    registerCollectionCapabilities(dispatcher, dependencies, operations, collectionSources);
    if (files) {
        registerFileCapabilities(dispatcher, files, fileWorkspace);
    }
    registerProviderCapabilities(dispatcher, gateway, providerManagement);
    registerAccessCapabilities(dispatcher, dependencies, gateway);
}

export {
    registerAccessCapabilities,
    registerCollectionCapabilities,
    registerContentCapabilities,
    registerFileCapabilities,
    registerProviderCapabilities,
};
export { CollectionSources } from "./collections/sources";
export { registerCollectionOperationCapabilities } from "./collections/operations";
export type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports";
