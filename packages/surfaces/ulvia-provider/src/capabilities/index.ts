import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type { UlviaProviderDependencies, UlviaProviderGateway, UlviaProviderManagement } from "../ports";
import { registerAccessCapabilities } from "./access";
import { registerCollectionCapabilities } from "./collections";
import { registerFileCapabilities } from "./files";
import { registerJobCapabilities } from "./jobs";
import { registerPageCapabilities } from "./pages";
import { registerProviderCapabilities } from "./providers";
import { registerLocalizationCapabilities } from "./site-configuration/localization";
import { registerThemeCapabilities } from "./site-configuration/theme";
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
): void {
    registerPageCapabilities(dispatcher, dependencies);
    registerCollectionCapabilities(dispatcher, dependencies, operations, collectionSources);
    if (files) {
        registerFileCapabilities(dispatcher, files);
    }
    registerThemeCapabilities(dispatcher, dependencies);
    registerLocalizationCapabilities(dispatcher, dependencies);
    registerProviderCapabilities(dispatcher, gateway, providerManagement);
    registerAccessCapabilities(dispatcher, dependencies, gateway);
    registerJobCapabilities(dispatcher, operations);
}

export {
    registerAccessCapabilities,
    registerCollectionCapabilities,
    registerFileCapabilities,
    registerJobCapabilities,
    registerLocalizationCapabilities,
    registerPageCapabilities,
    registerProviderCapabilities,
    registerThemeCapabilities,
};
export { CollectionSources } from "./collections/sources";
export type { UlviaProviderDependencies, UlviaProviderGateway, UlviaProviderManagement } from "../ports";
