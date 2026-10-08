import type { CoreCapabilityRegistry } from "../dispatch/registry";
import type { CmsCoreDependencies, CmsCoreGateway, CmsCoreProviderManagement } from "../ports";
import { registerAccessCapabilities } from "./access";
import { registerCollectionCapabilities } from "./collections";
import { registerFileCapabilities } from "./files";
import { registerJobCapabilities } from "./jobs";
import { registerPageCapabilities } from "./pages";
import { registerProviderCapabilities } from "./providers";
import { registerLocalizationCapabilities } from "./site-configuration/localization";
import { registerThemeCapabilities } from "./site-configuration/theme";
import type { CollectionSources } from "./collections/sources";
import type { CoreOperationExecutor } from "../operations/CoreOperationExecutor";
import type { CmsFilesService } from "@bernouy/cms-files";

export function registerOfficialCoreCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CmsCoreDependencies,
    gateway: CmsCoreGateway | undefined,
    operations?: CoreOperationExecutor,
    providerManagement?: CmsCoreProviderManagement,
    collectionSources?: CollectionSources,
    files?: CmsFilesService,
): void {
    registerPageCapabilities(dispatcher, core);
    registerCollectionCapabilities(dispatcher, core, operations, collectionSources);
    if (files) {
        registerFileCapabilities(dispatcher, files);
    }
    registerThemeCapabilities(dispatcher, core);
    registerLocalizationCapabilities(dispatcher, core);
    registerProviderCapabilities(dispatcher, gateway, providerManagement);
    registerAccessCapabilities(dispatcher, core, gateway);
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
export type { CmsCoreDependencies, CmsCoreGateway, CmsCoreProviderManagement } from "../ports";
