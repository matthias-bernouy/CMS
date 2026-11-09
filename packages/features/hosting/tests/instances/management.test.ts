import { expect, test } from "bun:test";
import { DomainAdmissionPolicy } from "@bernouy/hosting";
import { instanceFixture, creation } from "./fixture";

test("instance creation uses one identity under concurrent exact requests and projects no credentials", async () => {
    const f = await instanceFixture();
    const input = creation();
    const results = await Promise.all(Array.from({ length: 16 }, () => f.management.create(f.actor, input)));
    expect(new Set(results.map((result) => result.instance.id)).size).toBe(1);
    expect(f.registry.creates).toBe(1);
    expect(results.every((result) => result.instance.status === "ready")).toBe(true);
    expect(JSON.stringify(results)).not.toContain("must-never-escape");
    expect(results[0]!.instance).not.toHaveProperty("storageKey");
    expect(results[0]!.instance).not.toHaveProperty("idempotencyFingerprint");
    expect(results[0]!.instance).not.toHaveProperty("creationAuthority");
    expect((await f.management.create(f.actor, input)).instance).toEqual(results[0]!.instance);
});

test("idempotent site creation retains its original administrator and refuses reassignment without mutation", async () => {
    const f = await instanceFixture();
    const input = creation();
    const created = await f.management.create(f.actor, input);
    const record = structuredClone(await f.registry.get(created.instance.id));
    expect(record?.creationAuthority).toEqual({ kind: "control", actor: f.actor });
    await expect(f.management.create({ ...f.actor, subjectId: "another-admin" }, input)).rejects.toThrow(
        "different request",
    );
    expect(await f.registry.get(created.instance.id)).toEqual(record);
    expect(await f.store.getDomain("site.localhost")).toEqual(created.domain);
    expect(f.registry.creates).toBe(1);
});

test("domain collisions and conflicting idempotent requests leave no orphan instance or claim", async () => {
    const f = await instanceFixture();
    const input = creation();
    const result = await f.management.create(f.actor, input);
    await expect(f.management.create(f.actor, { ...input, requestId: crypto.randomUUID() })).rejects.toMatchObject({
        code: "CONFLICT",
    });
    await expect(f.management.create(f.actor, { ...input, origin: "http://other.localhost" })).rejects.toThrow(
        "different request",
    );
    await expect(f.management.create(f.actor, { ...input, label: "Other" })).rejects.toThrow("different request");
    expect(f.registry.creates).toBe(1);
    expect(await f.store.getDomain("other.localhost")).toBeNull();
    expect(await f.store.getDomain("site.localhost")).toEqual(result.domain);
});

test("one concurrent request cannot reserve different primary domains before instance insertion", async () => {
    const f = await instanceFixture();
    const input = creation();
    const results = await Promise.allSettled([
        f.management.create(f.actor, input),
        f.management.create(f.actor, { ...input, origin: "http://other.localhost" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const domains = await Promise.all([f.store.getDomain("site.localhost"), f.store.getDomain("other.localhost")]);
    expect(domains.filter(Boolean)).toHaveLength(1);
    expect(f.registry.creates).toBe(1);
});

test("authorization is checked on creation and exact replay before returning a result", async () => {
    const f = await instanceFixture();
    const input = creation();
    await expect(f.management.create({ instanceId: "site", subjectId: "admin" }, input)).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    expect(f.registry.creates).toBe(0);
    expect(await f.store.getDomain("site.localhost")).toBeNull();
    await f.management.create(f.actor, input);
    f.setAdmin(false);
    await expect(f.management.create(f.actor, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.management.list(f.actor, null, 10)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.registry.creates).toBe(1);
});

test("invalid inputs refuse before reserving any hosting state", async () => {
    const f = await instanceFixture();
    const input = creation();
    for (const patch of [
        { label: "" },
        { requestId: "invalid" },
        { administrator: { email: "bad", password: "short" } },
    ]) {
        await expect(f.management.create(f.actor, { ...input, ...patch })).rejects.toThrow();
    }
    expect(await f.store.getDomain("site.localhost")).toBeNull();
    expect(f.registry.creates).toBe(0);
});

test("custom domains await proof while deployment-owned suffixes await TLS", async () => {
    const f = await instanceFixture();
    const custom = await f.management.create(f.actor, creation("https://customer.example"));
    expect(custom.instance.status).toBe("ready");
    expect(custom.domain.state).toBe("pending");
    expect(custom.proof?.name).toBe("_ulvia.customer.example");
    const managed = await f.management.create(f.actor, creation("https://site.managed.example"));
    expect(managed.domain).toMatchObject({ state: "verified", tls: "pending" });
    expect(managed.proof).toBeNull();
    expect(
        new DomainAdmissionPolicy(["managed.example"], false).classify("https://managed.example.attacker.test").managed,
    ).toBe(false);
    expect(() => new DomainAdmissionPolicy([], false).classify("http://site.localhost")).toThrow();
});

test("instance listing is paged without the unbounded registry method and Control is protected", async () => {
    const f = await instanceFixture();
    for (const name of ["a", "b", "c"]) {
        await f.management.create(f.actor, creation(`http://${name}.localhost`));
    }
    const first = await f.management.list(f.actor, null, 2);
    const second = await f.management.list(f.actor, first.nextCursor, 2);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
    expect(second.nextCursor).toBeNull();
    expect(f.registry.pages).toBe(2);
    await expect(f.management.list(f.actor, null, 51)).rejects.toThrow();
    expect(f.registry.pages).toBe(2);
    await expect(f.management.disable(f.actor, "control-id")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const disabled = await f.management.disable(f.actor, first.items[0]!.id);
    expect(disabled.status).toBe("disabled");
    expect((await f.management.get(f.actor, disabled.id)).status).toBe("disabled");
});
