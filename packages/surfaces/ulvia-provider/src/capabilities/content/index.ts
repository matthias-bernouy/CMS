import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { CmsContentDependencies } from "../../ports";
import { registerLocalizationCapabilities } from "./localization";
import { registerPageCapabilities } from "./pages";
import { registerSiteCapabilities } from "./site";
import { registerThemeCapabilities } from "./theme";
import { registerContentDeliveryCapabilities } from "./delivery";
import { registerSiteBlocCapabilities } from "./siteBlocs";

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
