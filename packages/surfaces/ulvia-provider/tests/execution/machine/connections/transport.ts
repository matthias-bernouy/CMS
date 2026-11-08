import { createProviderHandler } from "@bernouy/cms-gateway/provider/server";
import type { ProviderConnectionRegistry } from "@bernouy/cms-gateway/provider";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";

const token = "provider-connections-test-" + "x".repeat(40);
const providerId = "ulvia/primary-provider";
export const connectionInput = {
    connectionId: "connection-a",
    cmsUrl: "https://cms.example",
    token: "private-return-token-" + "x".repeat(64),
    generation: 1,
};

/** Exercise the admitted HTTP receiver with signed claims, including hostile actor combinations. */
export async function connectionTransport(providerConnections: Pick<ProviderConnectionRegistry, "configure">) {
    const build = await loadOfficialFeatures();
    const contracts = build.implementedContracts.filter(
        ({ release }) => release.contractId === "ulvia/provider.connections",
    );
    const dispatcher = new DefaultProviderCapabilityDispatcher(contracts);
    await registerOfficialFeatures(
        dispatcher,
        { providerConnections },
        build.implementations.filter(({ contractId }) => contractId === "ulvia/provider.connections"),
        {
            providerId,
            scope: { siteId: "default", instanceId: "instance-a" },
            executeKeyed: async () => {
                throw new Error("Natural pairing must not access keyed receipts");
            },
        },
    );
    const handle = createProviderHandler({
        contracts,
        dispatcher,
        authenticate: async (request) => {
            try {
                const claims = verifyProviderInvocationToken(
                    (request.headers.get("authorization") ?? "").slice(7),
                    token,
                );
                return claims.instanceId === "instance-a" ? { claims, providerId, siteId: "default" } : null;
            } catch {
                return null;
            }
        },
        // The host admits the authenticated connection-control lane; the capability restricts its actor.
        authorize: async () => true,
    });
    return async (
        input: unknown = connectionInput,
        claims: Partial<ProviderInvocationClaims> = {},
        options: { authenticated?: boolean; headers?: HeadersInit } = {},
    ) => {
        const invocation: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: "instance-a",
            contractId: "ulvia/provider.connections",
            contractVersion: "1.0.0",
            capabilityId: "connections.configure",
            connectionId: "connection-a",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            ...claims,
        };
        const { connectionId, ...rest } = invocation;
        const signed = { ...rest, ...(connectionId ? { connectionId } : {}) };
        const headers = new Headers(options.headers);
        headers.set("content-type", "application/json");
        headers.set("x-ulvia-request-id", invocation.requestId);
        if (options.authenticated !== false) {
            headers.set("authorization", `Bearer ${signProviderInvocationToken(token, signed)}`);
        }
        return handle(
            new Request("https://provider.example/provider/connections", {
                method: "POST",
                headers,
                body: JSON.stringify(input),
            }),
        );
    };
}
