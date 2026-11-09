import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { InMemoryHostingStore } from "@bernouy/hosting/memory";
import { DomainTlsAuthority } from "@bernouy/hosting/tls";
import { mountPublicCapabilities } from "@bernouy/ulvia-provider";
import { createTlsRuntime } from "../../../src/runtime/instances/system/hosting/tlsRuntime";
import { SystemBootstrap } from "../../../src/runtime/instances/system/execution/SystemBootstrap";
import { bundledBootstrapSources } from "../../../src/runtime/instances/system/bootstrap";

test("the admitted TLS binding serves anonymous permission without accepting caller authority or exposing other host contracts", async () => {
    const store = new InMemoryHostingStore();
    const record = {
        hostname: "site.example",
        origin: "https://site.example",
        instanceId: "instance:one",
        claimId: crypto.randomUUID(),
        creationFingerprint: null,
        state: "verified",
        tls: "pending",
        revision: 1,
    } as const;
    await store.claimDomain(record);
    let configured = true;
    const authority = new DomainTlsAuthority(
        store,
        {
            getInstance: async () => ({
                id: "instance:one",
                cmsUrl: "https://site.example",
                revision: 1,
                status: "ready",
            }),
        },
        async () => configured,
    );
    const runtime = await createTlsRuntime(new SystemBootstrap(bundledBootstrapSources()), authority);
    const runner = new BunRunner();
    mountPublicCapabilities(runner, runtime, NOOP_LOGGER);
    const request = (domain: string, headers: HeadersInit = {}) =>
        runner.handle(new Request(`http://provider/hosting/tls/permission?domain=${domain}`, { headers }));
    const success = await request("site.example", {
        authorization: "Bearer forged",
        "x-ulvia-contract-id": "ulvia/cms.hosting",
        "x-ulvia-instance-id": "instance:control",
        "x-ulvia-request-id": "forged",
        "x-ulvia-request-context": "forged",
        "x-ulvia-actor-credential": "forged",
    });
    expect(success.status, await success.clone().text()).toBe(200);
    expect(await success.json()).toEqual({ permission: "allowed" });
    expect(success.headers.get("cache-control")).toBe("no-store");
    const unknown = await request("unknown.example");
    expect(unknown.status, await unknown.clone().text()).toBe(403);
    configured = false;
    expect((await request("site.example")).status).toBe(403);
    expect(await store.getDomain(record.hostname)).toEqual(record);
    expect((await runner.handle(new Request("http://provider/hosting/routing/resolve"))).status).toBe(404);
    expect(
        (
            await runner.handle(
                new Request("http://provider/hosting/tls/permission?domain=site.example", { method: "POST" }),
            )
        ).status,
    ).toBe(404);
});
