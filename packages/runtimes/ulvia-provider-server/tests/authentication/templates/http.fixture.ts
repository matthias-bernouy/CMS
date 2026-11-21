import type { UlviaProviderFeatureServices } from "@bernouy/ulvia-provider";
import { remoteRoute } from "./http.route";
import { expect } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import { compileProviderRoutes, createProviderContractRelay } from "@bernouy/cms-gateway/provider/server";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { NOOP_LOGGER } from "@bernouy/logging";
import { EmailTemplates } from "@bernouy/email-templates";
import { MemoryTemplateStore } from "@bernouy/email-templates/memory";
import { gatewayRoute, NOW } from "../../../../../../tests/integration/gateway/fixtures";
import { accountTemplateClient } from "../../../src/runtime/authentication/templates/client";

const secret = "test-provider-signature-secret-" + "s".repeat(32);
export async function httpFixture(emailer?: UlviaProviderFeatureServices["emailer"]) {
    const build = await loadOfficialFeatures();
    const view = build.implementedContracts.find(
        ({ release }) => release.contractId === (emailer ? "ulvia/cms.emailer.smtp" : "ulvia/cms.email-templates"),
    )!;
    const requested = build.contracts.find(
        ({ release }) => release.contractId === (emailer ? "ulvia/cms.emailer" : view.release.contractId),
    )!;
    const templates = new EmailTemplates(new MemoryTemplateStore());
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(
        dispatcher,
        { emailTemplates: templates, ...(emailer ? { emailer } : {}) },
        [{ contractId: view.release.contractId, version: view.release.version, digest: view.digest }],
        {
            providerId: "ulvia/primary-provider",
            scope: { siteId: "site-a", instanceId: "instance:account-a" },
            // This refusal fixture executes once per fresh key; durable receipt behavior is covered separately.
            executeKeyed: async (_invocation, execute) => execute(),
        },
    );
    const relay = createProviderContractRelay(
        compileProviderRoutes([view]),
        dispatcher,
        { providerId: "ulvia/primary-provider", siteId: "site-a" },
        NOOP_LOGGER,
    );
    let calls = 0;
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
            const token = request.headers.get("authorization")?.slice(7);
            const claims = token ? verifyProviderInvocationToken(token, secret) : null;
            if (!claims) {
                return new Response("Forbidden", { status: 403 });
            }
            calls++;
            expect(claims.sourceInstallationId).toBe("source-a");
            expect(claims.subjectId).toBeUndefined();
            return (await relay(request, claims)) ?? new Response("Missing binding", { status: 404 });
        },
    });
    const base = await gatewayRoute({ endpoint: server.url.origin, installationId: "remote-templates" });
    const admitted = build.contracts.find(({ release }) => release.contractId === view.release.contractId)!;
    const route = remoteRoute(base, view, admitted, requested);
    const access = await gatewayRoute({ contractId: "ulvia/cms.access", installationId: "source-a" });
    const connections = new ProviderConnections({
        get: async () =>
            JSON.stringify({
                connectionId: "source-a",
                cmsUrl: "https://site.test",
                token: "return-credential-" + "t".repeat(32),
                generation: 1,
            }),
        compareAndSet: async () => false,
    });
    let authorized = true;
    const requirements = build.implementations.find(({ contractId }) => contractId === "ulvia/cms.access")!.requires;
    const gateway = new CapabilityGateway({
        now: () => NOW,
        commandAudit: { append: async () => {} },
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async (actor, capability) =>
            authorized &&
            actor.kind === "provider" &&
            actor.installationId === "source-a" &&
            requirements.some(
                (requirement) =>
                    requirement.contractId === requested.release.contractId &&
                    requirement.capabilityId === capability.id,
            ),
        transport: new HttpGatewayTransport({
            network: new NodeGatewayHttpNetwork({ resolveToken: async () => secret, allowPrivateAddresses: true }),
        }),
    });
    const client = accountTemplateClient(
        {
            siteId: "site-a",
            routes: { resolve: async (_site, contract) => (contract === "ulvia/cms.access" ? access : route) },
            invoker: gateway,
        },
        connections,
        access.installation.installation.accountId,
    );
    return {
        templates,
        client: client.templates,
        call: client.call,
        calls: () => calls,
        revoke: () => {
            authorized = false;
        },
        close: () => server.stop(true),
    };
}
