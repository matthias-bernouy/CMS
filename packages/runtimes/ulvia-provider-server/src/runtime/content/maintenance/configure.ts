import { InMemoryCache } from "@bernouy/http-runner";
import { prepareMaintenancePage, PageCapabilityAnalyzer } from "@bernouy/content/public-delivery";
import { createContentReader } from "@bernouy/content/rendering";
import { satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import { resolveInstalledCollectionAssets } from "@bernouy/repository/collections/assets";
import { serveInstalledCollectionAsset } from "@bernouy/repository/collections/http";
import type { ProviderStores } from "../../stores/providerStores";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import { readCaptureFile } from "../captures/files";
import { resolveSvgSources } from "../inlineSvg";

export function configureMaintenancePages(
    stores: ProviderStores,
    gateway: Awaited<ReturnType<typeof createProviderGateway>>,
    publicUrl: string,
) {
    const assets = { siteId: gateway.siteId, store: stores.collections };
    stores.maintenancePages.configure(async (prefix, signal) => {
        // Request-local cache cannot retain old CSS, text or collection projections across upgrades.
        const cache = new InMemoryCache();
        return prepareMaintenancePage(
            {
                publicUrl,
                content: createContentReader(stores.repo),
                cache,
                logger: stores.logger,
                resolveContributedAssets: (input) => resolveInstalledCollectionAssets(input, assets, ""),
                serveCollectionAsset: (request) => serveInstalledCollectionAsset(request, assets, ""),
                readCaptureResource: (path, signal) => readCaptureFile(gateway.invoker, gateway.siteId, path, signal),
                pageCapabilities: new PageCapabilityAnalyzer({
                    satisfiesVersionRange,
                    resolveCapability: gateway.resolvePageCapability,
                }),
                resolveSvgSources: (sources) =>
                    resolveSvgSources(
                        {
                            cache,
                            assets,
                            release: async (contractId) => {
                                const route = await gateway.routes.resolve(gateway.siteId, contractId);
                                if (!route) {
                                    throw new Error("Maintenance SVG contract is unavailable");
                                }
                                return route.requestedRelease.admission.release;
                            },
                            client: {
                                invoke: async (release, capabilityId, input, options) => {
                                    const result = await gateway.invoker.invoke({
                                        siteId: gateway.siteId,
                                        contractId: release.contractId,
                                        capabilityId,
                                        input,
                                        bindingId: options.bindingId,
                                        actor: { kind: "anonymous" },
                                        signal,
                                    });
                                    if (result.kind !== "binary") {
                                        throw new Error("Maintenance SVG resource is unavailable");
                                    }
                                    return result;
                                },
                            },
                        },
                        sources,
                    ),
            },
            prefix,
            signal,
        );
    });
}
