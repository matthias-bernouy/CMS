import { expect, test } from "bun:test";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { observedRoute } from "../../provider/support/route";
import { SECRET, SITE, INSTANCE } from "../../provider/support/network";
import { dynamicFixture, value } from "./fixture";

test("signed Gateway calls resolve both DTOs without changing admitted dispatch metadata; refusal precedes the business call", async () => {
    const f = dynamicFixture();
    let receive: ((request: Request) => Promise<Response>) | undefined;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => receive!(request) });
    try {
        const origin = `http://127.0.0.1:${server.port}`;
        const build = await compileProvider({
            ...f.provider,
            endpoint: { defaultOrigin: origin, allowedOrigins: [origin] },
        });
        receive = createProvider(
            build,
            {},
            {
                scope: { siteId: SITE, instanceId: INSTANCE },
                schemaVersions: f.versions,
                authenticate: async (request) => ({
                    siteId: SITE,
                    providerId: build.manifest.manifest.providerId,
                    claims: verifyProviderInvocationToken(request.headers.get("authorization")!.slice(7), SECRET),
                }),
                authorize: async () => true,
            },
        ).fetch;
        const route = observedRoute(build, origin, SITE, INSTANCE, f.feature.contractId);
        let transports = 0;
        let denyResolver = false;
        const gateway = new CapabilityGateway({
            schemaVersions: {
                seal: ({ target, descriptor }) =>
                    f.versions.seal(
                        {
                            siteId: SITE,
                            providerId: build.manifest.manifest.providerId,
                            instanceId: target.instanceId,
                            installationId: target.installationId,
                            contractId: target.contractId,
                            resolverId: target.capabilityId,
                        },
                        descriptor,
                    ),
            },
            routes: { resolve: async () => route, isCurrent: async () => true },
            authorize: async (_actor, capability) => !(denyResolver && capability.schemaResolver),
            transport: new HttpGatewayTransport({
                network: new NodeGatewayHttpNetwork({
                    resolveToken: async () => {
                        transports++;
                        return SECRET;
                    },
                }),
            }),
        });
        const invoke = (input: unknown) =>
            gateway.invoke({
                siteId: SITE,
                contractId: f.feature.contractId,
                capabilityId: "read",
                input,
                actor: { kind: "anonymous" },
            });
        expect(await invoke(value)).toMatchObject({ kind: "success", output: { echo: value.payload } });
        expect(transports).toBe(3);
        expect(f.state.resolutions).toBe(4);
        expect(f.state.calls).toBe(1);
        await expect(invoke({ ...value, payload: { email: 42 } })).rejects.toHaveProperty("code", "invalid_input");
        expect(f.state.calls).toBe(1);
        const before = transports;
        denyResolver = true;
        await expect(invoke(value)).rejects.toHaveProperty("code", "not_authorized");
        expect(transports).toBe(before);
        expect(f.state.calls).toBe(1);
        denyResolver = false;
        f.state.changed = true;
        await expect(invoke(value)).rejects.toHaveProperty("code", "SCHEMA_VERSION_CONFLICT");
        expect(f.state.calls).toBe(1);
    } finally {
        await server.stop(true);
    }
});
