import { expect, test } from "bun:test";
import { defineProvider, implementFeature, z } from "@bernouy/ulvia-sdk";
import { compileContract, compileProvider } from "@bernouy/ulvia-sdk/build";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { DomainRegistry } from "@bernouy/hosting";
import { hostingFeature } from "@bernouy/hosting/feature";
import type { HostingServices } from "@bernouy/hosting/feature";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { instanceFixture, creation } from "./fixture";

async function featureFixture() {
    const f = await instanceFixture();
    const domains = new DomainRegistry(
        f.store,
        { getInstance: (id) => f.registry.get(id) },
        {
            assertAdministrator: (actor) => f.authority.assertAdministrator(actor),
            assertDomainCanBeDisabled: (actor, domain) => f.authority.assertDomainCanBeDisabled(actor, domain),
        },
        "proof-key-material".repeat(3),
        async () => false,
    );
    const services: HostingServices = { hosting: { authority: f.authority, instances: f.management, domains } };
    const context = {
        requestId: crypto.randomUUID(),
        siteId: "default",
        providerId: "ulvia/test-provider",
        contractVersion: "1.0.0",
        subjectId: "admin",
        invocation: { contractId: "ulvia/cms.hosting", instanceId: "control-id" },
    };
    return { ...f, services, context };
}

test("hosting compiles as one admitted feature with admin HTTP/MCP bindings and a sensitive bootstrap password", async () => {
    const compiled = await compileContract(hostingFeature);
    expect(compiled.release.capabilities).toHaveLength(8);
    for (const capability of compiled.release.capabilities) {
        expect(capability.access).toBe("admin");
        expect(capability.bindings?.map((binding) => binding.transport)).toEqual(["http", "mcp"]);
    }
    const create = compiled.release.capabilities.find((capability) => capability.id === "instances.create")!;
    expect(create.behavior).toMatchObject({ idempotency: "natural", execution: "sync" });
    expect(create.input).toMatchObject({
        properties: { administrator: { properties: { password: { sensitive: true } } } },
    });
});

test("default hosting executors validate DTOs, strip internal domain records and reject untrusted actors", async () => {
    const f = await featureFixture();
    const input = creation();
    const result = await executeCapability(hostingFeature, "instances.create", {
        services: f.services,
        context: f.context,
        input,
    });
    expect(result.instance.status).toBe("ready");
    expect(result.domain).not.toHaveProperty("creationFingerprint");
    expect(result.domain).not.toHaveProperty("claimId");
    for (const context of [
        { ...f.context, subjectId: undefined },
        { ...f.context, invocation: undefined },
        { ...f.context, systemServiceId: "cms-gateway" },
        { ...f.context, sourceInstallationId: "collection" },
        { ...f.context, controlAuthority: true as const },
        { ...f.context, invocation: { ...f.context.invocation, instanceId: "other-site" } },
    ]) {
        await expect(
            executeCapability(hostingFeature, "instances.create", { services: f.services, context, input }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    f.setAdmin(false);
    await expect(
        executeCapability(hostingFeature, "instances.get", {
            services: f.services,
            context: f.context,
            input: { instanceId: result.instance.id },
        }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.registry.creates).toBe(1);
});

test("signed Provider HTTP invocations cannot switch hosting scope through headers or replay after revocation", async () => {
    const f = await featureFixture();
    const secret = "signed-hosting-test-secret".repeat(3);
    const build = await compileProvider(
        defineProvider({
            providerId: "ulvia/test-provider",
            name: "Hosting test Provider",
            version: "1.0.0",
            provenance: { publisherId: "ulvia", publishedAt: "2026-11-09T00:00:00Z" },
            buildVersionRange: ">=1.0.0 <2.0.0",
            endpoint: { allowedOrigins: ["https://provider.example"], defaultOrigin: "https://provider.example" },
            configuration: z.strictObject({}),
            requires: [],
            credentialSlots: [],
            implementations: [implementFeature(hostingFeature)],
        }),
    );
    const provider = createProvider(build, f.services, {
        scope: { siteId: "default", instanceId: "control-id" },
        authorize: async () => true,
        authenticate: async (request) => {
            const token = request.headers.get("authorization")?.slice(7);
            return token
                ? {
                      siteId: "default",
                      providerId: "ulvia/test-provider",
                      claims: verifyProviderInvocationToken(token, secret),
                  }
                : null;
        },
    });
    const input = creation();
    const call = (instanceId = "control-id", subjectId = "admin") => {
        const now = Math.floor(Date.now() / 1000);
        const claims: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId,
            contractId: "ulvia/cms.hosting",
            contractVersion: "1.0.0",
            capabilityId: "instances.create",
            subjectId,
            issuedAt: now,
            expiresAt: now + 30,
        };
        return provider.fetch(
            new Request("https://provider.example/hosting/instances.create", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${signProviderInvocationToken(secret, claims)}`,
                    "x-ulvia-request-id": claims.requestId,
                    "x-ulvia-instance-id": "control-id",
                },
                body: JSON.stringify(input),
            }),
        );
    };
    expect((await call("other-site")).status).toBe(401);
    expect(f.registry.creates).toBe(0);
    const result = await call();
    expect(result.status).toBe(200);
    expect((await result.json()).instance.status).toBe("ready");
    f.setAdmin(false);
    const refused = await call();
    expect(refused.status).toBe(403);
    expect((await refused.json()).error.code).toBe("FORBIDDEN");
    expect(f.registry.creates).toBe(1);
});
