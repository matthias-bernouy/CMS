import { expect, test } from "bun:test";
import { fixture } from "./fixture";

test("concurrent claims are exclusive and exact retries retain their proof", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
        f.domains.claim(f.actor, "site-a", "https://example.com"),
        f.domains.claim(f.actor, "site-b", "https://example.com"),
    ]);
    expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    const first = await f.domains.claim(f.actor, "site-a", "https://example.com");
    const retry = await f.domains.claim(f.actor, "site-a", "https://EXAMPLE.com/");
    expect(retry).toEqual(first);
    const before = await f.store.getDomain("example.com");
    await expect(f.domains.claim(f.actor, "site-b", "https://example.com")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.store.getDomain("example.com")).toEqual(before);
});

test("tenant administration and missing targets refuse before domain mutation", async () => {
    const f = await fixture();
    await expect(
        f.domains.claim({ instanceId: "site-a", subjectId: "administrator" }, "site-a", "https://example.com"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.domains.claim(f.actor, "missing", "https://example.com")).rejects.toMatchObject({
        code: "NOT_FOUND",
    });
    expect(await f.store.getDomain("example.com")).toBeNull();
});

test("unverified ownership and revoked authority leave the claim unchanged", async () => {
    const f = await fixture();
    const { domain } = await f.domains.claim(f.actor, "site-a", "https://example.com");
    await expect(f.domains.verify(f.actor, domain.hostname, 1)).rejects.toMatchObject({ code: "DOMAIN_UNVERIFIED" });
    expect(await f.store.getDomain(domain.hostname)).toEqual(domain);
    f.setVerified(true);
    f.setProbe(async () => {
        f.setAdmin(false);
    });
    await expect(f.domains.verify(f.actor, domain.hostname, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await f.store.getDomain(domain.hostname)).toEqual(domain);
});

test("verification, TLS and instance readiness remain separate routing gates", async () => {
    const f = await fixture();
    const { domain } = await f.domains.claim(f.actor, "site-a", "https://example.com");
    expect(await f.domains.resolve(domain.hostname)).toBeNull();
    await expect(f.domains.recordTls(domain.hostname, 1, "ready")).rejects.toMatchObject({ code: "CONFLICT" });
    f.setVerified(true);
    await f.domains.verify(f.actor, domain.hostname, 1);
    expect(await f.domains.resolve(domain.hostname)).toBeNull();
    await f.domains.recordTls(domain.hostname, 2, "ready");
    expect(await f.domains.resolve(domain.hostname)).toMatchObject({
        instanceId: "site-a",
        domainRevision: 3,
        instanceRevision: 1,
    });
    f.instances.set("site-a", { id: "site-a", revision: 2, status: "disabled", cmsUrl: "http://a.localhost" });
    expect(await f.domains.resolve(domain.hostname)).toBeNull();
});

test("a stale TLS completion cannot reactivate a disabled domain", async () => {
    const f = await fixture();
    const domain = await f.domains.registerManaged("site-a", "https://example.com");
    const disabled = await f.domains.disable(f.actor, domain.hostname, domain.revision);
    await expect(f.domains.recordTls(domain.hostname, domain.revision, "ready")).rejects.toMatchObject({
        code: "CONFLICT",
    });
    await expect(f.domains.recordTls(domain.hostname, disabled.revision, "ready")).rejects.toMatchObject({
        code: "CONFLICT",
    });
    expect(await f.domains.resolve(domain.hostname)).toBeNull();
});

test("domain pages are bounded, ordered and scoped to the requested instance", async () => {
    const f = await fixture();
    for (const hostname of ["c.localhost", "a.localhost", "b.localhost"]) {
        await f.domains.registerManaged("site-a", `http://${hostname}`);
    }
    await f.domains.registerManaged("site-b", "http://foreign.localhost");
    const first = await f.domains.list(f.actor, "site-a", null, 2);
    expect(first.items.map((value) => value.hostname)).toEqual(["a.localhost", "b.localhost"]);
    expect(first.nextCursor).toBe("b.localhost");
    const next = await f.domains.list(f.actor, "site-a", first.nextCursor, 2);
    expect(next.items.map((value) => value.hostname)).toEqual(["c.localhost"]);
    expect(next.nextCursor).toBeNull();
    await expect(f.domains.list(f.actor, "site-a", null, 51)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("routing performs one indexed domain read and one exact instance read without listing", async () => {
    const f = await fixture();
    await f.domains.registerManaged("site-a", "http://a.localhost");
    const before = f.counts();
    const route = await f.domains.resolve("A.LOCALHOST");
    expect(route).toMatchObject({ origin: "http://a.localhost", instanceId: "site-a" });
    expect(f.counts().domainReads - before.domainReads).toBe(1);
    expect(f.counts().instanceReads - before.instanceReads).toBe(1);
    const missingBefore = f.counts();
    expect(await f.domains.resolve("unknown.localhost")).toBeNull();
    expect(f.counts().domainReads - missingBefore.domainReads).toBe(1);
    expect(f.counts().instanceReads - missingBefore.instanceReads).toBe(0);
});

test("Control's initial domain cannot be disabled by hosting administration", async () => {
    const f = await fixture();
    const domain = await f.domains.registerManaged("control-id", "http://control.localhost");
    await expect(f.domains.disable(f.actor, domain.hostname, domain.revision)).rejects.toMatchObject({
        code: "FORBIDDEN",
    });
    expect(await f.store.getDomain(domain.hostname)).toEqual(domain);
});

test("localhost HTTPS still requires TLS readiness instead of the HTTP-only development exemption", async () => {
    const f = await fixture();
    const domain = await f.domains.registerManaged("site-a", "https://secure.localhost");
    expect(domain).toMatchObject({ state: "verified", tls: "pending" });
    expect(await f.domains.resolve(domain.hostname)).toBeNull();
});
