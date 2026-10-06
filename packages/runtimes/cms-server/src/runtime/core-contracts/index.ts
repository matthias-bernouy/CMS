import { registerCmsPageCoreCapabilities, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { ProductionGateway } from "../gateway/createProductionGateway";
import type { CoreStores } from "../stores/core";
import { registerAccessCapabilities } from "./access";
import { registerCollectionCapabilities } from "./collections";
import { registerDesignCapabilities } from "./design";
import { registerFileCapabilities } from "./files";
import { registerOperationCapabilities } from "./operations";
import { registerProviderCapabilities } from "./providers";
import type { CoreOperationExecutor } from "../core-operations/CoreOperationExecutor";

export function registerOfficialCoreCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CoreStores,
    gateway: ProductionGateway | undefined,
    operations?: CoreOperationExecutor,
): void {
    registerCmsPageCoreCapabilities(dispatcher, core.repo);
    registerCollectionCapabilities(dispatcher, core);
    registerFileCapabilities(dispatcher, core);
    registerDesignCapabilities(dispatcher, core);
    registerProviderCapabilities(dispatcher, gateway);
    registerAccessCapabilities(dispatcher, core, gateway);
    registerOperationCapabilities(dispatcher, core, operations);
}
