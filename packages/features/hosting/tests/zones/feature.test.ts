import { expect, test } from "bun:test";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { compileContract } from "@bernouy/ulvia-sdk/build";
import { DomainRegistry } from "@bernouy/hosting";
import { hostingFeature } from "@bernouy/hosting/feature";
import { instanceFixture } from "../instances/fixture";

async function setup() {
    const f = await instanceFixture();
    const domains = new DomainRegistry(
        f.store,
        { getInstance: (id) => f.registry.get(id) },
        f.authority,
        "a".repeat(32),
        async () => false,
        f.admission,
    );
    return {
        ...f,
        services: { hosting: { authority: f.authority, instances: f.management, domains, zones: f.zones } },
        context: {
            requestId: crypto.randomUUID(),
            siteId: "default",
            providerId: "ulvia/test-provider",
            subjectId: "admin",
            invocation: { instanceId: "control-id", contractId: "ulvia/cms.hosting" },
        },
    };
}

test("Hosting 1.1 publishes four zone HTTP/MCP operations and projects only public DTOs", async () => {
    const compiled = await compileContract(hostingFeature);
    expect(compiled.release.version).toBe("1.1.0");
    for (const id of ["zones.claim", "zones.verify", "zones.list", "zones.disable"]) {
        const capability = compiled.release.capabilities.find((entry) => entry.id === id)!;
        expect(capability.access).toBe("admin");
        expect(capability.bindings?.map((binding) => binding.transport)).toEqual(["http", "mcp"]);
    }
    const f = await setup();
    const base = { services: f.services, context: f.context };
    const claimed = await executeCapability(hostingFeature, "zones.claim", {
        ...base,
        input: { hostname: "demo.example" },
    });
    expect(Object.keys(claimed.zone).sort()).toEqual(["hostname", "revision", "state"]);
    f.setZoneVerified(true);
    const verified = await executeCapability(hostingFeature, "zones.verify", {
        ...base,
        input: { hostname: "demo.example", expectedRevision: claimed.zone.revision },
    });
    const page = await executeCapability(hostingFeature, "zones.list", { ...base, input: { after: null, limit: 1 } });
    expect(page).toEqual({ items: [verified], nextCursor: null });
    expect(JSON.stringify(page)).not.toContain("control-id");
    expect(JSON.stringify(page)).not.toContain("claimId");
    const disabled = await executeCapability(hostingFeature, "zones.disable", {
        ...base,
        input: { hostname: "demo.example", expectedRevision: verified.revision },
    });
    expect(disabled.state).toBe("disabled");
});

test("zone executors reject foreign, machine, delegated and revoked authority without mutation", async () => {
    const f = await setup();
    for (const context of [
        { ...f.context, subjectId: undefined },
        { ...f.context, invocation: undefined },
        { ...f.context, systemServiceId: "cms-edge" },
        { ...f.context, sourceInstallationId: "collection" },
        { ...f.context, controlAuthority: true as const },
        { ...f.context, invocation: { ...f.context.invocation, instanceId: "other-site" } },
    ]) {
        await expect(
            executeCapability(hostingFeature, "zones.claim", {
                services: f.services,
                context,
                input: { hostname: "demo.example" },
            }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
        executeCapability(hostingFeature, "zones.claim", {
            services: f.services,
            context: f.context,
            input: { hostname: "*.demo.example" },
        }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    f.setAdmin(false);
    await expect(
        executeCapability(hostingFeature, "zones.claim", {
            services: f.services,
            context: f.context,
            input: { hostname: "demo.example" },
        }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await f.zoneStore.getZone("demo.example")).toBeNull();
});
