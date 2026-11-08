import { CapabilityGateway } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { createProviderHandler, DefaultProviderCapabilityDispatcher } from "@bernouy/cms-gateway/provider/server";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { gatewayRoute, NOW } from "../../fixtures";

export async function fixture(resource: boolean, overrides: Parameters<typeof gatewayRoute>[0] = {}, granted = true) {
    const route = await gatewayRoute({ ...(resource ? { binary: true, resource: true } : {}), ...overrides });
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(route.requestedRelease.admission);
    const contracts = [await resolveContract(catalogue, route.requestedRelease.admission)];
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const secret = "independent-provider-credential-" + "x".repeat(32);
    let handler: ReturnType<typeof createProviderHandler>;
    const wireHeaders: Readonly<Record<string, string>>[] = [];
    const network = new NodeGatewayHttpNetwork({
        resolveToken: async () => secret,
        resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
        sendPinned: async (value) => {
            wireHeaders.push(value.headers);
            return handler(
                new Request(value.url, {
                    method: value.method,
                    headers: value.headers,
                    body: value.body as BodyInit | undefined,
                    signal: value.signal,
                }),
            );
        },
    });
    const gateway = new CapabilityGateway({
        now: () => NOW,
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => granted,
        commandAudit: { append: async () => {} },
        transport: new HttpGatewayTransport({ network }),
    });
    return {
        dispatcher,
        gateway,
        wireHeaders,
        mount() {
            handler = createProviderHandler({
                contracts,
                dispatcher,
                authenticate: async (request) => {
                    const claims = verifyProviderInvocationToken(
                        request.headers.get("authorization")!.slice(7),
                        secret,
                    );
                    return claims ? { claims, siteId: "site-a", providerId: "ulvia/independent" } : null;
                },
            });
        },
    };
}
