import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { specializedRoute } from "../../../../features/cms-gateway/tests/invocation/specialization/fixture";
import { createInvocationIssuer } from "../../src/runtime/gateway/providers/authority/issueInvocation";

test("inherited calls cross the HTTP token broker with parent pins and concrete site grants", async () => {
    const f = await specializedRoute();
    const secret = "specialization-test-secret-" + "a".repeat(32);
    const grants = { default: "allow-selected" as const, denied: [] as { contractId: string; capabilityId: string }[] };
    const provenance: unknown[] = [];
    const issued: unknown[] = [];
    const requests: unknown[] = [];
    const issuer = createInvocationIssuer(
        "site-a",
        f.routes,
        { get: async () => ({ grants }) } as never,
        {
            consumeBudget: async () => true,
            authorize: async (target) => {
                provenance.push(target);
                return true;
            },
        },
        async () => secret,
    );
    const gateway = new CapabilityGateway({
        routes: f.routes,
        authorize: async () => true,
        transport: new HttpGatewayTransport({
            network: new NodeGatewayHttpNetwork({
                resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }],
                authorize: async (request) => {
                    if (request.authentication.kind !== "capability") {
                        throw new Error("Capability authorization required");
                    }
                    const result = await issuer({
                        ...request.authentication,
                        requestId: request.requestId,
                        installationId: request.installationId!,
                    });
                    issued.push(verifyProviderInvocationToken(result.token, secret));
                    return { token: result.token };
                },
                sendPinned: async (request) => {
                    requests.push(request.url.href);
                    expect(
                        verifyProviderInvocationToken(request.headers.authorization!.slice(7), secret),
                    ).toMatchObject({ contractId: "catalog", contractVersion: "1.0.0", capabilityId: "item.list" });
                    return Response.json({ items: ["one"] });
                },
            }),
        }),
    });
    const invoke = () =>
        gateway.invoke({
            siteId: "site-a",
            contractId: "catalog",
            capabilityId: "item.list",
            input: {},
            actor: { kind: "provider", installationId: "source", credentialFingerprint: "f".repeat(64) },
        });
    expect(await invoke()).toMatchObject({ kind: "success", output: { items: ["one"] } });
    expect(issued).toEqual([
        expect.objectContaining({
            contractId: "catalog",
            contractVersion: "1.0.0",
            connectionId: "install-a",
            sourceInstallationId: "source",
        }),
    ]);
    expect(provenance).toHaveLength(2);
    for (const target of provenance) {
        expect(target).toMatchObject({
            contractId: "catalog",
            version: "1.0.0",
            capabilityId: "item.list",
            targetInstallationId: "install-a",
            sourceCredentialFingerprint: "f".repeat(64),
        });
    }
    grants.denied.push({ contractId: "catalog.sql", capabilityId: "item.list" });
    await expect(invoke()).rejects.toMatchObject({ code: "transport_failure" });
    expect(requests).toHaveLength(1);
    grants.denied.length = 0;
    await expect(
        issuer({
            requestId: crypto.randomUUID(),
            installationId: "install-a",
            contractId: "catalog",
            contractVersion: "2.0.0",
            capabilityId: "item.list",
        }),
    ).rejects.toMatchObject({ code: "route_not_found" });
});
