import { createDescriptionCache } from "./descriptionCache";
import { contentGatewayClient } from "./gatewayClient";
import { contentPhaseObserver } from "./observe";
import { ContentDelivery, PageCapabilityAnalyzer } from "@bernouy/cms-content/public-delivery";
import { createContentReader } from "@bernouy/cms-content/rendering";
import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import { resolveInstalledCollectionAssets } from "@bernouy/cms-repository/collections/assets";
import { serveInstalledCollectionAsset, collectionMaintenanceResponse } from "@bernouy/cms-repository/collections/http";
import { InMemoryCache } from "@bernouy/http-runner";
import { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import type { CmsContentDependencies, ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import type { ProviderStores } from "../stores/providerStores";
import type { createProviderGateway } from "../gateway/createProviderGateway";
import { editorialPages } from "./editorialPages";
import { resolveSvgSources } from "./inlineSvg";

export function createPublicDelivery(
    stores: ProviderStores,
    gateway: Awaited<ReturnType<typeof createProviderGateway>>,
    publicUrl: string,
): Pick<CmsContentDependencies, "publicDelivery" | "contentQuery"> {
    const cache = new InMemoryCache();
    const readSelectionRevision = async () =>
        (await stores.executionState.read(gateway.siteId, [])).selections?.revision ?? 0;
    const description = createDescriptionCache(readSelectionRevision);
    const analyzer = new PageCapabilityAnalyzer({ satisfiesVersionRange, resolveCapability: async () => null });
    const content = createContentReader(stores.repo);
    const assets = { siteId: gateway.siteId, store: stores.collections };
    const connections = new ProviderConnections(stores.providerConnections);
    const client = (context: ProviderCapabilityInvocationContext) => {
        return contentGatewayClient({
            connections,
            context,
            siteId: gateway.siteId,
        });
    };
    const release = async (contractId: string) => {
        const route = await gateway.routes.resolve(gateway.siteId, contractId);
        if (!route) {
            throw new Error("Content target contract is unavailable");
        }
        return route.requestedRelease.admission.release;
    };
    return {
        publicDelivery: (context) =>
            new ContentDelivery({
                content,
                observe: contentPhaseObserver(stores.logger),
                cache,
                logger: stores.logger,
                publicUrl,
                sitemapStore: stores.sitemapStore,
                editorialPages: editorialPages(stores.repo),
                resolveContributedAssets: (input) => resolveInstalledCollectionAssets(input, assets, ""),
                serveCollectionAsset: (request) => serveInstalledCollectionAsset(request, assets, ""),
                guard: (request) =>
                    collectionMaintenanceResponse(request, {
                        siteId: gateway.siteId,
                        upgrades: stores.upgradeStorage,
                        basePath: "",
                    }),
                resolveSvgSources: (sources) =>
                    resolveSvgSources({ cache, assets, client: client(context), release }, sources),
                pageCapabilities: {
                    requiredAccess: async (page) => {
                        const revision = await readSelectionRevision();
                        return analyzer.requiredAccess(page, (contractId) =>
                            description(contractId, revision, async () => {
                                const response = await client(context).invoke(
                                    await release("ulvia.cms.installations"),
                                    "capabilities.describe",
                                    { contractId },
                                    { authority: "provider" },
                                );
                                const value = response.output as {
                                    found: boolean;
                                    version: string;
                                    capabilities: { id: string; access: "public" | "authenticated" | "admin" }[];
                                };
                                if (value?.found !== true && value?.found !== false) {
                                    throw new Error("Capability description response is unavailable");
                                }
                                return value.found ? value : null;
                            }),
                        );
                    },
                },
            }),
        contentQuery: async (context, contractId, capabilityId, input) => {
            if (!context.delegation) {
                return new Response(null, { status: 503 });
            }
            const target = await release(contractId);
            if (target.capabilities.find((item) => item.id === capabilityId)?.behavior.effect !== "query") {
                return new Response(null, { status: 403 });
            }
            try {
                const result = await client(context).invoke(target, capabilityId, input, {
                    authority: "delegated",
                    delegation: context.delegation,
                });
                if (result.stream) {
                    await result.stream.cancel();
                    return new Response(null, { status: 502 });
                }
                return Response.json(result.output ?? null, { status: result.status ?? 200 });
            } catch {
                return new Response(null, { status: 503 });
            }
        },
    };
}
