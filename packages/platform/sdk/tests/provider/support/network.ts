import { CapabilityGateway } from "@bernouy/cms-gateway";
import { observedRoute } from "./route";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { verifyProviderInvocationToken, signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderRuntimeOptions } from "@bernouy/ulvia-sdk/provider";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../examples/provider";

export const SECRET = "example-only-provider-token-" + "x".repeat(40);
export const SITE = "site-example";
export const INSTANCE = "instance:notes";

export async function runningNotes() {
    let receive: ((request: Request) => Promise<Response>) | undefined;
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: (request) => receive?.(request) ?? new Response(null, { status: 503 }),
    });
    try {
        const origin = `http://127.0.0.1:${server.port}`;
        const definition = notesProviderDefinition(origin);
        const build = await compileProvider(definition);
        let reads = 0;
        let authentications = 0;
        let authorizations = 0;
        let gatewayAuthorizations = 0;
        let factories = 0;
        let allowed = true;
        let authority = { siteId: SITE, instanceId: INSTANCE, providerId: build.manifest.manifest.providerId };
        const options: ProviderRuntimeOptions = {
            scope: { siteId: SITE, instanceId: INSTANCE },
            authenticate: async (request) => {
                authentications++;
                const authorization = request.headers.get("authorization");
                if (!authorization?.startsWith("Bearer ")) {
                    return null;
                }
                return {
                    claims: verifyProviderInvocationToken(authorization.slice(7), SECRET),
                    siteId: authority.siteId,
                    providerId: authority.providerId,
                };
            },
            authorize: async () => {
                authorizations++;
                return allowed;
            },
        };
        const runtime = createProvider(
            build,
            {
                factoryCreated: () => {
                    factories++;
                },
                notes: {
                    read: async (id) => {
                        reads++;
                        return id === "welcome" ? { id, text: "Hello from the SDK" } : null;
                    },
                },
            },
            options,
        );
        receive = runtime.fetch;
        const route = observedRoute(build, origin, SITE, INSTANCE);
        let exchanges = 0;
        const transport = new HttpGatewayTransport({
            network: new NodeGatewayHttpNetwork({
                resolveToken: async () => {
                    exchanges++;
                    return SECRET;
                },
            }),
        });
        const gateway = new CapabilityGateway({
            routes: {
                resolve: async (siteId, contractId) =>
                    siteId === SITE && contractId === route.release.admission.release.contractId ? route : null,
                isCurrent: async () => true,
            },
            authorize: async () => {
                gatewayAuthorizations++;
                return allowed;
            },
            identities: { getOrCreate: async () => "opaque-example-user" },
            transport,
        });
        const claims = (patch: Partial<ProviderInvocationClaims> = {}): ProviderInvocationClaims => ({
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: INSTANCE,
            contractId: "example/notes",
            contractVersion: "1.0.0",
            capabilityId: "notes.read",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 20,
            ...patch,
        });
        return {
            build,
            runtime,
            gateway,
            options,
            origin,
            counts: () => ({ reads, factories, exchanges, authentications, authorizations, gatewayAuthorizations }),
            deny: () => {
                allowed = false;
            },
            changeAuthority: (patch: Partial<typeof authority>) => {
                authority = { ...authority, ...patch };
            },
            signedRequest: (id: string, patch: Partial<ProviderInvocationClaims> = {}) => {
                const value = claims(patch);
                return new Request(`${origin}/notes/${encodeURIComponent(id)}`, {
                    headers: {
                        authorization: `Bearer ${signProviderInvocationToken(SECRET, value)}`,
                        "x-ulvia-request-id": value.requestId,
                    },
                });
            },
            close: () => server.stop(true),
        };
    } catch (error) {
        await server.stop(true);
        throw error;
    }
}
