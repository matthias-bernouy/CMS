import { admitContractRelease, resolveContract } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { createProviderHandler, DefaultProviderCapabilityDispatcher } from "@bernouy/cms-gateway/provider/server";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { gatewayRoute } from "../../fixtures";

export const message = {
    type: "object",
    properties: { message: { type: "string", maxLength: 128 } },
    required: ["message"],
};
export const extended = {
    ...message,
    properties: {
        ...message.properties,
        issues: { type: "array", maxItems: 10, items: { type: "string", maxLength: 64 } },
    },
};
export const details = {
    message: "La página contiene dos títulos H1",
    issues: ["multiple-h1"],
    internal: "private diagnostic",
};

export async function fixture() {
    const base = (await gatewayRoute()).release.admission.release;
    const catalogue = new InMemoryReleaseCatalogue();
    const releases = await Promise.all(
        [undefined, message, extended].map((output, index) =>
            admitContractRelease({
                ...base,
                version: `1.${index}.0`,
                capabilities: base.capabilities.map((capability) => ({
                    ...capability,
                    errors: [{ code: "NOT_FOUND", retryable: false, ...(output ? { output } : {}) }],
                })),
            }),
        ),
    );
    for (const release of releases) {
        await catalogue.publish(release);
    }
    const contracts = await Promise.all(releases.map((release) => resolveContract(catalogue, release)));
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const secret = "independent-provider-credential-" + "x".repeat(32);
    let handler: ReturnType<typeof createProviderHandler>;
    const mount = () => {
        handler = createProviderHandler({
            contracts,
            dispatcher,
            authenticate: async (request) => {
                const claims = verifyProviderInvocationToken(request.headers.get("authorization")!.slice(7), secret);
                return claims ? { claims, siteId: "site-a", providerId: "ulvia/independent" } : null;
            },
        });
    };
    let sends = 0;
    const transport = new HttpGatewayTransport({
        network: new NodeGatewayHttpNetwork({
            resolveToken: async () => secret,
            resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
            sendPinned: async (request) => {
                sends++;
                return handler(
                    new Request(request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: request.body as BodyInit | undefined,
                        signal: request.signal,
                    }),
                );
            },
        }),
    });
    return {
        dispatcher,
        mount,
        transport,
        count: () => sends,
        requests: releases.map(({ release }) => ({
            requestId: crypto.randomUUID(),
            instanceId: "instance:account-a",
            installationId: "install-a",
            endpoint: "https://provider.example.com",
            providerTokenRef: "credential",
            release,
            capability: release.capabilities[0]!,
            bindingId: "http",
            input: {},
            requestContext: { headers: { "accept-language": "es" } },
        })),
    };
}
