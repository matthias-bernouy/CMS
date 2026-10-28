import { expect, test } from "bun:test";
import { delegationFixture } from "./fixtures";

test("delegation preserves anonymous authority, pins the root and closes immediately", async () => {
    const f = await delegationFixture();
    const source = f.root();
    const ticket = (await f.authority.issue(source))!;
    expect(ticket.expiresAt).toBe(f.state.now + 30_000);
    expect(ticket.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await f.authority.check(f.child(ticket.ticket), true, 3)).toEqual({
        actor: { kind: "anonymous" },
        rootRequestId: source.requestId,
    });
    await f.authority.close({ siteId: "site-a", ticket: ticket.ticket, requestId: "wrong-request" });
    await expect(f.authority.check(f.child(ticket.ticket))).resolves.toBeDefined();
    await f.authority.close({ siteId: "site-a", ticket: ticket.ticket, requestId: source.requestId });
    await expect(f.authority.check(f.child(ticket.ticket))).rejects.toMatchObject({ code: "not_authorized" });
});

test("expiry, site/source substitution, grants, disablement and credential/config rotations invalidate tickets", async () => {
    for (const mutation of [
        (f: Awaited<ReturnType<typeof delegationFixture>>) => {
            f.state.now += 30_000;
        },
        (f: Awaited<ReturnType<typeof delegationFixture>>) => {
            f.state.current.grants.denied.push({ contractId: "destination", capabilityId: "item.list" });
        },
        (f: Awaited<ReturnType<typeof delegationFixture>>) => {
            f.source.installation.installation.status = "disabled";
        },
        (f: Awaited<ReturnType<typeof delegationFixture>>) => {
            f.target.installation.installation.status = "disabled";
        },
        (f: Awaited<ReturnType<typeof delegationFixture>>) => {
            f.source.installation.installation.configuration = { changed: true };
        },
        (f: Awaited<ReturnType<typeof delegationFixture>>) => {
            f.source.installation.installation.gatewayTokenRef = "${ROTATED}";
        },
        (f: Awaited<ReturnType<typeof delegationFixture>>) => {
            f.state.credential = "rotated-in-place";
        },
        (f: Awaited<ReturnType<typeof delegationFixture>>) => {
            f.state.current.revision++;
        },
    ]) {
        const f = await delegationFixture();
        const ticket = (await f.authority.issue(f.root()))!;
        await expect(f.authority.check({ ...f.child(ticket.ticket), siteId: "site-b" })).rejects.toThrow();
        await expect(
            f.authority.check({ ...f.child(ticket.ticket), sourceInstallationId: "foreign" }),
        ).rejects.toThrow();
        mutation(f);
        await expect(f.authority.check(f.child(ticket.ticket))).rejects.toMatchObject({ code: "not_authorized" });
    }
});

test("original actor revisions and access levels remain authoritative", async () => {
    const f = await delegationFixture({ targetAccess: "admin" });
    await expect(f.authority.check(f.child((await f.authority.issue(f.root()))!.ticket))).rejects.toThrow();
    f.state.actor = { kind: "administrator", subjectId: "user-a", authorizationRevision: 7 };
    const ticket = (await f.authority.issue(f.root()))!;
    expect((await f.authority.check(f.child(ticket.ticket))).actor).toEqual(f.state.actor);
    f.state.actor = { kind: "user", subjectId: "user-a", authorizationRevision: 8 };
    await expect(f.authority.check(f.child(ticket.ticket))).rejects.toThrow();
    await expect(
        f.authority.issue({ ...f.root(), actor: { kind: "system", serviceId: "cms-kernel" } as never }),
    ).rejects.toThrow();
    await expect(f.authority.issue({ ...f.root(), actor: { kind: "user", subjectId: "user-a" } })).rejects.toThrow();
});

test("query sources cannot delegate commands and non-sensitive selectors exclude sensitive queries", async () => {
    for (const options of [{ targetEffect: "command" as const }, { sensitive: true }]) {
        const f = await delegationFixture({
            ...options,
            policy: {
                sources: ["*"],
                allow: [
                    {
                        contractId: "*",
                        capabilityId: "*",
                        effect: "*",
                        ...(options.sensitive ? { sensitive: false } : {}),
                    },
                ],
            },
        });
        await expect(f.authority.check(f.child((await f.authority.issue(f.root()))!.ticket))).rejects.toThrow();
    }
    const f = await delegationFixture({
        sourceEffect: "command",
        targetEffect: "command",
        policy: { sources: ["*"], allow: [{ contractId: "*", capabilityId: "*", effect: "*" }] },
    });
    await expect(f.authority.check(f.child((await f.authority.issue(f.root()))!.ticket))).resolves.toBeDefined();
});

test("ticket calls and byte budgets are atomic and bounded", async () => {
    const f = await delegationFixture();
    const ticket = (await f.authority.issue(f.root()))!;
    const results = await Promise.allSettled(
        Array.from({ length: 40 }, () => f.authority.check(f.child(ticket.ticket), true, 0)),
    );
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(32);
    const next = (await f.authority.issue(f.root()))!;
    await f.authority.check(f.child(next.ticket), true, 4 * 1024 * 1024);
    await expect(f.authority.check(f.child(next.ticket), true, 1)).rejects.toThrow();
    for (const bytes of [-1, Infinity, 0.5]) {
        await expect(f.authority.check(f.child(next.ticket), true, bytes)).rejects.toThrow();
    }
});

test("reviewed delegation pins the exact requested lineage artifact", async () => {
    const f = await delegationFixture();
    f.state.current.plan = {
        ...f.state.current.plan,
        authority: {
            ...f.state.current.plan.authority,
            capabilities: f.state.current.plan.authority.capabilities.map((entry) => ({
                ...entry,
                digest: "sha256:" + "0".repeat(64),
            })),
        },
    };
    const issued = (await f.authority.issue(f.root()))!;
    await expect(f.authority.check(f.child(issued.ticket))).rejects.toMatchObject({ code: "not_authorized" });
});
