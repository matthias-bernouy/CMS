import { expect, test } from "bun:test";
import { DomainTlsReconciler } from "@bernouy/hosting/tls";
import { DomainRegistry, DomainAdmissionPolicy } from "@bernouy/hosting";
import { fixture } from "../fixture";

test("background reconciliation seeks bounded pages, resumes across ticks and stops before scanning after abort", async () => {
    const f = await fixture();
    for (let index = 0; index < 51; index++) {
        await f.domains.registerManaged("site-a", `https://a${String(index).padStart(2, "0")}.example`);
    }
    let scans = 0;
    let pending = 0;
    let peak = 0;
    const visited: string[] = [];
    const reconciler = new DomainTlsReconciler(
        {
            scanDomains: async (input) => {
                scans++;
                expect(input.limit).toBe(50);
                return f.store.scanDomains(input);
            },
        },
        { permit: async () => undefined },
        f.domains,
        async (domain) => {
            pending++;
            peak = Math.max(peak, pending);
            await Promise.resolve();
            visited.push(domain.hostname);
            pending--;
            return true;
        },
        () => undefined,
    );
    const abort = new AbortController();
    await reconciler.batch(abort.signal);
    expect(visited).toHaveLength(50);
    await reconciler.batch(abort.signal);
    expect(visited).toHaveLength(51);
    expect(new Set(visited).size).toBe(51);
    expect(peak).toBe(4);
    abort.abort();
    await reconciler.batch(abort.signal);
    await reconciler.drain();
    expect(scans).toBe(2);
});

test("managed and local aliases share deployment admission while customer aliases await exact proof", async () => {
    const f = await fixture();
    const registry = new DomainRegistry(
        f.store,
        { getInstance: async (id) => f.instances.get(id) ?? null },
        f.authority,
        "domain-proof-material".repeat(3),
        async () => false,
        new DomainAdmissionPolicy(["managed.example"], true),
    );
    expect((await registry.claim(f.actor, "site-a", "http://alias.localhost")).domain).toMatchObject({
        state: "active",
        tls: "not-required",
    });
    expect((await registry.claim(f.actor, "site-a", "https://alias.managed.example")).domain).toMatchObject({
        state: "verified",
        tls: "pending",
    });
    expect((await registry.claim(f.actor, "site-a", "https://customer.example")).domain).toMatchObject({
        state: "pending",
        tls: "pending",
    });
});
