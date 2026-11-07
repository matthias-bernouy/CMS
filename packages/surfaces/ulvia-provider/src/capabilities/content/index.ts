import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { CmsContentDependencies } from "../../ports/index";
import { registerLocalizationCapabilities } from "./localization";
import { registerPageCapabilities } from "./pages/index";
import { registerSiteCapabilities } from "./site/index";
import { registerThemeCapabilities } from "./theme";
import { registerContentDeliveryCapabilities } from "./delivery/index";
import { registerSiteBlocCapabilities } from "./site/blocs";

export function registerContentCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    registerSiteCapabilities(dispatcher, dependencies);
    registerPageCapabilities(dispatcher, dependencies);
    registerSiteBlocCapabilities(dispatcher, dependencies);
    registerLocalizationCapabilities(dispatcher, dependencies);
    registerThemeCapabilities(dispatcher, dependencies);
    registerContentDeliveryCapabilities(dispatcher, dependencies);
}
