import { expect, test } from "bun:test";
import { DomainTlsAuthority, DomainTlsReconciler } from "@bernouy/hosting/tls";
import { fixture } from "../fixture";

test("TLS permission refuses unknown, unverified, HTTP and disabled domains without DNS or mutation", async () => {
    const f = await fixture();
    let probes = 0;
    const authority = new DomainTlsAuthority(
        f.store,
        { getInstance: async (id) => f.instances.get(id) ?? null },
        async () => {
            probes++;
            return true;
        },
    );
    const pending = await f.domains.claim(f.actor, "site-a", "https://pending.example");
    const plain = await f.domains.registerManaged("site-a", "http://plain.localhost");
    const ready = await f.domains.registerManaged("site-a", "https://ready.example");
    const disabled = await f.domains.disable(f.actor, ready.hostname, ready.revision);
    for (const hostname of ["unknown.example", pending.domain.hostname, plain.hostname, disabled.hostname]) {
        await expect(authority.permit(hostname)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(probes).toBe(0);
    expect(await f.store.getDomain(pending.domain.hostname)).toEqual(pending.domain);
    expect(await f.store.getDomain(disabled.hostname)).toEqual(disabled);
});

test("permission fences configuration, domain revision and target authority after asynchronous DNS", async () => {
    for (const mode of ["dns", "domain", "instance", "ready"] as const) {
        const f = await fixture();
        const domain = await f.domains.registerManaged("site-a", "https://ready.example");
        const authority = new DomainTlsAuthority(
            f.store,
            { getInstance: async (id) => f.instances.get(id) ?? null },
            async () => {
                if (mode === "domain") {
                    await f.domains.disable(f.actor, domain.hostname, domain.revision);
                }
                if (mode === "instance") {
                    f.instances.set("site-a", { ...f.instances.get("site-a")!, revision: 2, status: "disabled" });
                }
                return mode !== "dns";
            },
        );
        if (mode === "ready") {
            await authority.permit(domain.hostname);
        } else {
            await expect(authority.permit(domain.hostname)).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
        expect((await f.store.getDomain(domain.hostname))?.tls).toBe("pending");
    }
});

test("permission bounds pending DNS checks and releases capacity after a failed load", async () => {
    const f = await fixture();
    await f.domains.registerManaged("site-a", "https://ready.example");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const authority = new DomainTlsAuthority(
        f.store,
        { getInstance: async (id) => f.instances.get(id) ?? null },
        async () => {
            entered();
            await gate;
            return false;
        },
        1,
    );
    const first = authority.permit("ready.example");
    await started;
    await expect(authority.permit("ready.example")).rejects.toMatchObject({ code: "UNAVAILABLE" });
    release();
    await expect(first).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(authority.permit("ready.example")).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("reconciliation coalesces batches, fences disable during probing and avoids repeated readiness revisions", async () => {
    const f = await fixture();
    const domain = await f.domains.registerManaged("site-a", "https://ready.example");
    const authority = new DomainTlsAuthority(
        f.store,
        { getInstance: async (id) => f.instances.get(id) ?? null },
        async () => true,
    );
    let probes = 0;
    let disable = false;
    const outcomes: string[] = [];
    const reconciler = new DomainTlsReconciler(
        f.store,
        authority,
        f.domains,
        async (current) => {
            probes++;
            if (disable) {
                await f.domains.disable(f.actor, current.hostname, current.revision);
            }
            return true;
        },
        (_hostname, outcome) => outcomes.push(outcome),
    );
    const signal = new AbortController().signal;
    await Promise.all(Array.from({ length: 8 }, () => reconciler.batch(signal)));
    expect(probes).toBe(1);
    const active = (await f.store.getDomain(domain.hostname))!;
    expect(active).toMatchObject({ state: "active", tls: "ready" });
    await reconciler.batch(signal);
    expect(await f.store.getDomain(domain.hostname)).toEqual(active);
    disable = true;
    await reconciler.batch(signal);
    expect((await f.store.getDomain(domain.hostname))?.state).toBe("disabled");
    expect(outcomes).toEqual(["ready", "ready", "changed"]);
});

test("certificate or configuration failure withdraws a warmed route and a later successful probe restores it", async () => {
    const f = await fixture();
    const domain = await f.domains.registerManaged("site-a", "https://ready.example");
    await f.domains.recordTls(domain.hostname, domain.revision, "ready");
    let valid = false;
    const authority = new DomainTlsAuthority(
        f.store,
        { getInstance: async (id) => f.instances.get(id) ?? null },
        async () => valid,
    );
    const reconciler = new DomainTlsReconciler(
        f.store,
        authority,
        f.domains,
        async () => valid,
        () => undefined,
    );
    const signal = new AbortController().signal;
    await reconciler.batch(signal);
    expect(await f.domains.resolve(domain.hostname)).toBeNull();
    expect((await f.store.getDomain(domain.hostname))?.tls).toBe("failed");
    valid = true;
    await reconciler.batch(signal);
    expect(await f.domains.resolve(domain.hostname)).not.toBeNull();
});
