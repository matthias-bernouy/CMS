import { expect, test } from "bun:test";
import { ControlProviderClient } from "../../../src/runtime/gateway/ControlProviderClient";
import { InstallationsProviderTransport } from "../../../src/runtime/gateway/InstallationsProviderTransport";
import { ControlGatewayRouteResolver } from "../../../src/runtime/gateway/RemoteGatewayServices";

function fixture() {
    const snapshot = {
        selection: {
            siteId: "default",
            contractId: "example/items",
            installationId: "a",
            version: "1.0.0",
            digest: "a",
        },
        lineage: [{ contractId: "example/items" }],
        release: {},
        requestedRelease: {},
        manifest: {},
        installation: {
            installation: { id: "a", status: "enabled" },
            observation: {
                report: {
                    implementations: [{ contractId: "example/items", version: "1.0.0", digest: "a", status: "ready" }],
                },
            },
        },
    };
    let respond = () => Response.json({ route: JSON.stringify(snapshot) });
    let reads = 0;
    const transport = new InstallationsProviderTransport(
        "http://provider:5103",
        "control-token-for-testing-only",
        (async () => {
            reads += 1;
            return respond();
        }) as typeof fetch,
    );
    return {
        snapshot,
        control: new ControlProviderClient(transport),
        reads: () => reads,
        respond: (next: () => Response) => {
            respond = next;
        },
    };
}

test("decoding reuse keeps every fresh control request, scope guard and final readiness fence", async () => {
    const f = fixture();
    const resolver = new ControlGatewayRouteResolver(f.control, Date.now, 0);
    const first = (await resolver.resolve("default", "example/items"))!;
    expect(await resolver.resolve("default", "example/items")).toBe(first);
    expect(f.reads()).toBe(2);
    await expect(resolver.resolve("other-tenant", "example/items")).rejects.toThrow("does not match");
    await expect(resolver.resolve("default", "other/contract")).rejects.toThrow("does not match");
    expect(await resolver.isCurrent(first)).toBeTrue();
    f.snapshot.installation.installation.status = "disabled";
    expect(await resolver.isCurrent(first)).toBeFalse();
    f.snapshot.installation.installation.status = "enabled";
    f.snapshot.installation.observation.report.implementations[0]!.status = "unavailable";
    expect(await resolver.isCurrent(first)).toBeFalse();
    expect(f.reads()).toBe(7);
    f.respond(() => new Response(null, { status: 404 }));
    expect(await resolver.resolve("default", "example/items")).toBeNull();
    expect(await resolver.isCurrent(first)).toBeFalse();
    expect(f.reads()).toBe(9);
});

test("cache hits cannot mask malformed, oversized, forbidden or unavailable current replies", async () => {
    const f = fixture();
    const resolver = new ControlGatewayRouteResolver(f.control, Date.now, 0);
    await resolver.resolve("default", "example/items");
    for (const status of [403, 429, 503]) {
        f.respond(() => new Response(null, { status }));
        await expect(resolver.resolve("default", "example/items")).rejects.toThrow(`(${status})`);
    }
    f.respond(() => new Response('{"route":'));
    await expect(resolver.resolve("default", "example/items")).rejects.toThrow(SyntaxError);
    f.respond(() => Response.json({ route: "x".repeat(1024 * 1024 + 1) }));
    await expect(resolver.resolve("default", "example/items")).rejects.toThrow("route is too large");
    f.respond(() => new Response("x".repeat(2 * 1024 * 1024 + 1)));
    await expect(resolver.resolve("default", "example/items")).rejects.toThrow("response is too large");
    f.respond(() => Response.json({ route: JSON.stringify(f.snapshot) }));
    expect(await resolver.resolve("default", "example/items")).not.toBeNull();
    expect(f.reads()).toBe(8);
});

test("authorization and token issuance still fetch fresh responses after route decoding is warmed", async () => {
    const f = fixture();
    await f.control.getGatewayRoute("example/items");
    const input = {
        sourceInstallationId: "source",
        sourceCredentialFingerprint: "fingerprint",
        targetInstallationId: "a",
        contractId: "example/items",
        capabilityId: "list",
        version: "1.0.0",
    };
    f.respond(() => Response.json({ allowed: true }));
    expect(await f.control.authorizeProvider(input)).toBeTrue();
    f.respond(() => Response.json({ allowed: false }));
    expect(await f.control.authorizeProvider(input)).toBeFalse();
    const issue = {
        requestId: crypto.randomUUID(),
        installationId: "a",
        contractId: "example/items",
        contractVersion: "1.0.0",
        capabilityId: "list",
    };
    f.respond(() => Response.json({ token: "first", instanceId: "a" }));
    expect((await f.control.issueGatewayInvocation(issue)).token).toBe("first");
    f.respond(() => Response.json({ token: "second", instanceId: "a" }));
    expect((await f.control.issueGatewayInvocation(issue)).token).toBe("second");
    expect(f.reads()).toBe(5);
});
