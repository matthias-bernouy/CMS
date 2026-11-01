import { resourceResponse } from "@bernouy/cms-gateway/provider/server";
import type { ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";
import { resolveDelivery, deliveryCacheTags } from "./resolve";

export function registerContentDeliveryCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    dispatcher.register("ulvia.cms.content", "delivery.resolve-resource", async (input, context) => {
        const response = await resolveDelivery(input, context, dependencies);
        return resourceResponse(response, {
            vary: ["accept", "accept-language"],
            cacheTags: deliveryCacheTags(response),
        });
    });
}
