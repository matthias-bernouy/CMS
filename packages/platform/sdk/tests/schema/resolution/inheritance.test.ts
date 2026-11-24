import { expect, test } from "bun:test";
import { defineFeature, implementFeature } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { observedRoute } from "../../provider/support/route";
import { SECRET, SITE, INSTANCE } from "../../provider/support/network";
import { dynamicFixture, value } from "./fixture";

test("inherited resolver aliases use their declaring contract and one seal across direct and consuming calls", async () => {
    const f = dynamicFixture();
    const parent = defineFeature({ ...f.feature, contractId: "example/schemas", capabilities: [f.resolver] });
    const child = defineFeature({ ...f.feature, extends: parent, capabilities: [f.capability] });
    let receive: ((request: Request) => Promise<Response>) | undefined;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => receive!(request) });
    try {
        const origin = `http://127.0.0.1:${server.port}`;
        const build = await compileProvider({
            ...f.provider,
            implementations: [implementFeature(child)],
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
        const base = observedRoute(build, origin, SITE, INSTANCE, child.contractId);
        const implemented = build.implementedContracts.find(({ release }) => release.contractId === child.contractId)!;
        const lineage = implemented.lineage.map(({ release, digest }) => ({
            contractId: release.contractId,
            version: release.version,
            digest,
            name: release.name,
            capabilityIds: release.capabilities.map(({ id }) => id),
            ...(release.extends ? { extends: release.extends } : {}),
        }));
        const ancestor = build.contracts.find(({ release }) => release.contractId === parent.contractId)!;
        const roles = {
            ...base,
            lineage,
            requestedRelease: { admission: ancestor, publishedAt: new Date().toISOString() },
        };
        const route = { ...base, lineage };
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
            routes: {
                resolve: async (_site, contractId) => (contractId === child.contractId ? route : roles),
                isCurrent: async () => true,
            },
            authorize: async () => true,
            transport: new HttpGatewayTransport({
                network: new NodeGatewayHttpNetwork({ resolveToken: async () => SECRET }),
            }),
        });
        expect(
            await gateway.invoke({
                siteId: SITE,
                contractId: child.contractId,
                capabilityId: "read",
                input: value,
                actor: { kind: "anonymous" },
            }),
        ).toMatchObject({ output: { echo: value.payload } });
        f.state.changed = true;
        await expect(
            gateway.invoke({
                siteId: SITE,
                contractId: parent.contractId,
                capabilityId: f.resolver.id,
                input: { selectorJson: '{"formId":"contact"}', version: "1" },
                actor: { kind: "anonymous" },
            }),
        ).resolves.toMatchObject({ kind: "declared-error", errorCode: "SCHEMA_VERSION_CONFLICT" });
    } finally {
        await server.stop(true);
    }
});
