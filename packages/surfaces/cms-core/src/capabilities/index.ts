import type { CoreCapabilityRegistry } from "../dispatch/registry";
import type { CmsCoreDependencies, CmsCoreGateway, CmsCoreProviderManagement } from "../ports";
import { registerAccessCapabilities } from "./access";
import { registerCollectionCapabilities } from "./collections";
import { registerDesignCapabilities } from "./design";
import { registerFileCapabilities } from "./files";
import { registerOperationCapabilities } from "./operations";
import { registerPageCapabilities } from "./pages";
import { registerProviderCapabilities } from "./providers";
import type { CollectionSources } from "./collections/sources";
import type { CoreOperationExecutor } from "../operations/CoreOperationExecutor";

export function registerOfficialCoreCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CmsCoreDependencies,
    gateway: CmsCoreGateway | undefined,
    operations?: CoreOperationExecutor,
    providerManagement?: CmsCoreProviderManagement,
    collectionSources?: CollectionSources,
): void {
    registerPageCapabilities(dispatcher, core);
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
    registerPageCapabilities,
    registerProviderCapabilities,
};
export { CollectionSources } from "./collections/sources";
export type { CmsCoreDependencies, CmsCoreGateway, CmsCoreProviderManagement } from "../ports";
