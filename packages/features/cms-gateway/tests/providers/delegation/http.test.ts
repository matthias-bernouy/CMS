import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { GatewayProviderClient } from "@bernouy/cms-gateway/provider/node";
import { verifyProviderInvocationToken, type ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { DelegationContext } from "@bernouy/cms-gateway/access/delegation";
import { delegationFixture } from "./fixtures";
import { NOW } from "../../fixtures";

test("a third-party Provider delegates through CMS to another Provider with a scoped alias and no recursive ticket", async () => {
    const sourceSecret = "source-" + "a".repeat(48);
    const targetSecret = "target-" + "b".repeat(48);
    const returnToken = "return-" + "c".repeat(48);
    let client: GatewayProviderClient;
    let f: Awaited<ReturnType<typeof delegationFixture>>;
    let context: DelegationContext;
    let targetClaims: ProviderInvocationClaims | undefined;
    let handler: (request: Request) => Promise<Response>;
    const cms = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => handler(request) });
    const target = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch(request) {
            targetClaims = verifyProviderInvocationToken(request.headers.get("authorization")!.slice(7), targetSecret);
            expect(request.headers.get("cookie")).toBeNull();
            expect(request.headers.get("x-ulvia-delegation")).toBeNull();
            expect(request.headers.get("x-ulvia-provider-authority")).toBeNull();
            return Response.json({ items: ["private target value"] });
        },
    });
    const source = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        async fetch(request) {
            const claims = verifyProviderInvocationToken(request.headers.get("authorization")!.slice(7), sourceSecret);
            expect(claims.subjectId).toBeUndefined();
            context = { ticket: claims.delegationTicket!, expiresAt: claims.delegationExpiresAt! };
            const response = await client.invoke(
                f.target.release.admission.release,
                "item.list",
                {},
                { authority: "delegated", delegation: context },
            );
            return Response.json(response.output);
        },
    });
    try {
        f = await delegationFixture({
            sourceEndpoint: source.url.origin,
            targetEndpoint: target.url.origin,
            targetAccess: "authenticated",
        });
        f.source.installation.installation.providerTokenRef = "source-key";
        f.target.installation.installation.providerTokenRef = "target-key";
        // The source fingerprint is captured only after the trusted runtime wiring is complete.
        f.state.credential = providerCredentialFingerprint(returnToken);
        f.state.actor = { kind: "user", subjectId: "global-user-never-forwarded", authorizationRevision: 4 };
        client = new GatewayProviderClient({ cmsUrl: cms.url.origin, token: returnToken, allowPrivateAddresses: true });
        const gateway = new CapabilityGateway({
            routes: f.routes,
            delegations: f.authority,
            now: () => NOW,
            authorize: async () => true,
            identities: { getOrCreate: async () => "destination-scoped-user", resolve: async () => null },
            transport: new HttpGatewayTransport({
                network: new NodeGatewayHttpNetwork({
                    allowPrivateAddresses: true,
                    resolveToken: async (ref) => (ref === "source-key" ? sourceSecret : targetSecret),
                }),
            }),
        });
        handler = createCapabilityHttpHandler({
            siteId: "site-a",
            basePath: "",
            invoker: gateway,
            authenticateProvider: async (token) => (token === returnToken ? "origin-install" : null),
            resolveActor: async () => ({ kind: "anonymous" }),
        });
        const result = await gateway.invoke({
            siteId: "site-a",
            contractId: "origin",
            capabilityId: "item.list",
            input: {},
            actor: f.state.actor,
        });
        expect(result.kind).toBe("success");
        expect(targetClaims).toMatchObject({
            subjectId: "destination-scoped-user",
            sourceInstallationId: "origin-install",
        });
        expect(targetClaims?.rootRequestId).toBe(result.requestId);
        expect(targetClaims?.delegationTicket).toBeUndefined();
        expect(JSON.stringify(targetClaims)).not.toContain("global-user-never-forwarded");
        await expect(
            client.invoke(
                f.target.release.admission.release,
                "item.list",
                {},
                { authority: "delegated", delegation: context! },
            ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
        source.stop(true);
        target.stop(true);
        cms.stop(true);
    }
});
