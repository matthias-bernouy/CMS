import { expect, test } from "bun:test";
import { DomainRegistry, HostingError, PrimaryDomainManagement } from "@bernouy/hosting";
import { creation, instanceFixture } from "./fixture";

async function fixture() {
    const f = await instanceFixture();
    const request = creation("http://a.localhost");
    const created = await f.management.create(f.actor, request);
    const domains = new DomainRegistry(
        f.store,
        { getInstance: (id) => f.registry.get(id) },
        f.authority,
        "proof-key-material".repeat(3),
        async () => true,
        f.admission,
    );
    const second = (await domains.claim(f.actor, created.instance.id, "http://b.localhost")).domain;
    const input = {
        instanceId: created.instance.id,
        hostname: second.hostname,
        expectedInstanceRevision: created.instance.revision,
        expectedDomainRevision: second.revision,
    };
    return { ...f, request, created, second, input, domains };
}

test("primary election A to B to A preserves instance identity, callbacks and Repository bindings", async () => {
    const f = await fixture();
    const before = structuredClone((await f.registry.get(f.input.instanceId))!);
    const elected = await f.primaryDomains.elect(f.actor, f.input);
    expect(elected.origin).toBe("http://b.localhost");
    const current = (await f.registry.get(f.input.instanceId))!;
    expect(current).toEqual({ ...before, cmsUrl: elected.origin, revision: before.revision + 1 });
    expect(await f.domains.resolve("a.localhost")).toMatchObject({
        canonicalOrigin: elected.origin,
        instanceRevision: current.revision,
    });
    expect(await f.primaryDomains.elect(f.actor, f.input)).toEqual(elected);
    expect((await f.management.create(f.actor, f.request)).instance.origin).toBe(elected.origin);
    await expect(f.domains.disable(f.actor, "a.localhost", f.created.domain.revision)).rejects.toMatchObject({
        code: "CONFLICT",
    });
    await expect(f.domains.disable(f.actor, "b.localhost", elected.domain.revision)).rejects.toMatchObject({
        code: "CONFLICT",
    });
    const restored = await f.primaryDomains.elect(f.actor, {
        ...f.input,
        hostname: "a.localhost",
        expectedInstanceRevision: current.revision,
        expectedDomainRevision: f.created.domain.revision,
    });
    expect(restored.origin).toBe(before.cmsUrl);
    expect((await f.domains.resolve("b.localhost"))?.canonicalOrigin).toBe(before.cmsUrl);
});

test("foreign, unready, stale and unauthorized elections leave public state unchanged", async () => {
    const f = await fixture();
    const before = structuredClone(await f.registry.get(f.input.instanceId));
    await expect(f.primaryDomains.elect({ instanceId: "foreign", subjectId: "admin" }, f.input)).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    const other = await f.management.create(f.actor, creation("http://other.localhost"));
    await expect(
        f.primaryDomains.elect(f.actor, { ...f.input, hostname: other.domain.hostname }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const pending = (await f.domains.claim(f.actor, f.input.instanceId, "https://pending.example")).domain;
    await expect(f.primaryDomains.elect(f.actor, { ...f.input, hostname: pending.hostname })).rejects.toMatchObject({
        code: "DOMAIN_UNVERIFIED",
    });
    await expect(f.primaryDomains.elect(f.actor, { ...f.input, expectedInstanceRevision: 123 })).rejects.toMatchObject({
        code: "CONFLICT",
    });
    await expect(f.primaryDomains.elect(f.actor, { ...f.input, expectedDomainRevision: 123 })).rejects.toMatchObject({
        code: "CONFLICT",
    });
    await expect(f.primaryDomains.elect(f.actor, { ...f.input, expectedDomainRevision: 0 })).rejects.toMatchObject({
        code: "INVALID_INPUT",
    });
    f.setAdmin(false);
    await expect(f.primaryDomains.elect(f.actor, f.input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await f.registry.get(f.input.instanceId)).toEqual(before);
    expect(await f.store.getDomain(f.second.hostname)).toEqual(f.second);
    expect(await f.store.getPrimaryElection(f.second.hostname)).toBeNull();
});

test("an election reservation fences a disable started with the previous domain revision", async () => {
    const f = await fixture();
    const current = await f.store.getDomain(f.second.hostname);
    const pending = await f.store.reservePrimaryElection({ ...f.input, token: crypto.randomUUID() });
    await expect(
        f.store.replaceDomain(current!.revision, { ...current!, state: "disabled", revision: current!.revision + 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await f.registry.setPublicOrigin(f.input.instanceId, f.input.expectedInstanceRevision, f.second.origin);
    await f.store.finishPrimaryElection(pending, true);
    await expect(
        f.store.replaceDomain(current!.revision, { ...current!, state: "disabled", revision: current!.revision + 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("retry recovers an interrupted election and fences its previous writer", async () => {
    const f = await fixture();
    await f.store.reservePrimaryElection({ ...f.input, token: crypto.randomUUID() });
    const elected = await f.primaryDomains.elect(f.actor, f.input);
    expect(elected.origin).toBe(f.second.origin);
    expect(await f.store.getPrimaryElection(f.second.hostname)).toBeNull();
    await expect(
        f.registry.setPublicOrigin(f.input.instanceId, f.input.expectedInstanceRevision, f.created.domain.origin),
    ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("retry finalizes a committed election whose domain publication was interrupted", async () => {
    const f = await fixture();
    await f.store.reservePrimaryElection({ ...f.input, token: crypto.randomUUID() });
    await f.registry.setPublicOrigin(f.input.instanceId, f.input.expectedInstanceRevision, f.second.origin);
    const elected = await f.primaryDomains.elect(f.actor, f.input);
    expect(elected.domain.revision).toBe(f.second.revision + 1);
    expect(await f.store.getPrimaryElection(f.second.hostname)).toBeNull();
});

for (const acknowledged of [false, true]) {
    test(`uncertain registry outcome retains its reservation and recovers (write applied: ${acknowledged})`, async () => {
        const f = await fixture();
        const primary = new PrimaryDomainManagement(
            f.store,
            {
                getInstance: (id) => f.registry.get(id),
                setPublicOrigin: async (id, revision, origin) => {
                    if (acknowledged) {
                        await f.registry.setPublicOrigin(id, revision, origin);
                    }
                    throw new Error("Connection lost during write");
                },
            },
            f.authority,
        );
        await expect(primary.elect(f.actor, f.input)).rejects.toThrow("Connection lost");
        expect(await f.store.getPrimaryElection(f.second.hostname)).not.toBeNull();
        await expect(f.domains.disable(f.actor, f.second.hostname, f.second.revision)).rejects.toMatchObject({
            code: "CONFLICT",
        });
        expect((await f.primaryDomains.elect(f.actor, f.input)).origin).toBe(f.second.origin);
        expect(await f.store.getPrimaryElection(f.second.hostname)).toBeNull();
    });
}

test("concurrent elections have one winner and a revoked actor cannot commit a reserved election", async () => {
    const f = await fixture();
    const third = (await f.domains.claim(f.actor, f.input.instanceId, "http://c.localhost")).domain;
    const results = await Promise.allSettled([
        f.primaryDomains.elect(f.actor, f.input),
        f.primaryDomains.elect(f.actor, {
            ...f.input,
            hostname: third.hostname,
            expectedDomainRevision: third.revision,
        }),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const g = await fixture();
    let checks = 0;
    const primary = new PrimaryDomainManagement(
        g.store,
        {
            getInstance: (id) => g.registry.get(id),
            setPublicOrigin: (id, revision, origin) => g.registry.setPublicOrigin(id, revision, origin),
        },
        {
            assertAdministrator: async () => {
                if (++checks === 2) {
                    throw new HostingError("FORBIDDEN", "Revoked");
                }
            },
        },
    );
    await expect(primary.elect(g.actor, g.input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await g.registry.get(g.input.instanceId))!.cmsUrl).toBe(g.created.instance.origin);
    expect(await g.store.getPrimaryElection(g.second.hostname)).toBeNull();
});
