import { registerCmsPageCoreCapabilities, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import { registerAccessCapabilities } from "./access";
import { registerCollectionCapabilities } from "./collections";
import { registerDesignCapabilities } from "./design";
import { registerFileCapabilities } from "./files";
import { registerOperationCapabilities } from "./operations";
import { registerProviderCapabilities } from "./providers";
import type { CollectionSources } from "./collections/sources";
import type { CmsCoreCapabilityStores, CmsCoreGateway, CmsCoreProviderManagement } from "./dependencies";
import type { CoreOperationExecutor } from "../operations/CoreOperationExecutor";

export function registerOfficialCoreCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CmsCoreCapabilityStores,
    gateway: CmsCoreGateway | undefined,
    operations?: CoreOperationExecutor,
    providerManagement?: CmsCoreProviderManagement,
    collectionSources?: CollectionSources,
): void {
    registerCmsPageCoreCapabilities(dispatcher, core.repo);
    registerCollectionCapabilities(dispatcher, core, operations, collectionSources);
    registerFileCapabilities(dispatcher, core);
    registerDesignCapabilities(dispatcher, core);
    registerProviderCapabilities(dispatcher, gateway, providerManagement);
    registerAccessCapabilities(dispatcher, core, gateway);
    registerOperationCapabilities(dispatcher, core, operations);
}

export {
    registerAccessCapabilities,
    registerCollectionCapabilities,
    registerDesignCapabilities,
    registerFileCapabilities,
    registerOperationCapabilities,
    registerProviderCapabilities,
};
export { CollectionSources } from "./collections/sources";
export type {
    CmsCoreCapabilityStores,
    CmsCoreGateway,
    CmsCoreProviderManagement,
} from "./dependencies";
