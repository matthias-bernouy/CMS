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
export async function httpFixture() {
    const build = await loadOfficialFeatures();
    const view = build.implementedContracts.find(({ release }) => release.contractId === "ulvia/cms.email-templates")!;
    const templates = new EmailTemplates(new MemoryTemplateStore());
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(
        dispatcher,
        { emailTemplates: templates },
        [{ contractId: view.release.contractId, version: view.release.version, digest: view.digest }],
        { providerId: "ulvia/primary-provider", scope: { siteId: "site-a", instanceId: "instance:account-a" } },
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
    const pin = { contractId: admitted.release.contractId, version: admitted.release.version, digest: admitted.digest };
    const route = {
        ...base,
        manifest: {
            ...base.manifest,
            admission: {
                ...base.manifest.admission,
                manifest: { ...base.manifest.admission.manifest, implementations: [{ ...pin, requires: [] }] },
            },
        },
        installation: {
            ...base.installation,
            observation: {
                ...base.installation.observation!,
                report: {
                    ...base.installation.observation!.report,
                    implementations: [{ ...pin, status: "ready" as const }],
                },
            },
        },
        release: { ...base.release, admission: admitted },
        requestedRelease: { ...base.requestedRelease, admission: admitted },
        selection: { ...base.selection, ...pin },
        lineage: [
            { ...pin, name: admitted.release.name, capabilityIds: admitted.release.capabilities.map(({ id }) => id) },
        ],
    };
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
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async (actor, capability) =>
            authorized &&
            actor.kind === "provider" &&
            actor.installationId === "source-a" &&
            requirements.some(
                (requirement) =>
                    requirement.contractId === admitted.release.contractId &&
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
        calls: () => calls,
        revoke: () => {
            authorized = false;
        },
        close: () => server.stop(true),
    };
}
