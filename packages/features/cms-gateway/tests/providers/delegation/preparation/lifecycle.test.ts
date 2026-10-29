import { delegationFixture } from "../fixtures";
import { expect, test } from "bun:test";
import { prepareDispatch } from "cms-gateway/invocation/core/dispatch/prepareDispatch";

test("dispatch prepares identity and delegation concurrently and closes a partial root before propagating failure", async () => {
    for (const failIdentity of [false, true]) {
        const subject = Promise.withResolvers<string>();
        const root = Promise.withResolvers<{ ticket: string; expiresAt: number }>();
        const events: string[] = [];
        const pending = prepareDispatch(
            () => {
                events.push("identity");
                return subject.promise;
            },
            () => {
                events.push("delegation");
                return root.promise;
            },
            async () => {
                events.push("closed");
            },
        );
        const outcome = pending.then(
            (value) => ({ value }),
            (error) => ({ error }),
        );
        await Promise.resolve();
        expect(events).toEqual(["identity", "delegation"]);
        root.resolve({ ticket: "ticket", expiresAt: Date.now() + 1000 });
        if (failIdentity) {
            subject.reject(new Error("identity revoked"));
        } else {
            subject.resolve("alias");
        }
        const result = await outcome;
        if ("error" in result) {
            expect(result.error.message).toBe("identity revoked");
            expect(events.at(-1)).toBe("closed");
        } else {
            expect(result.value.subjectId).toBe("alias");
            expect(events).not.toContain("closed");
        }
    }
});

test("prepared roots keep the bearer private, inspect fresh authority once, and finalize only once", async () => {
    const f = await delegationFixture();
    f.state.actor = { kind: "administrator", subjectId: "user-a", authorizationRevision: 4 };
    const source = f.root();
    const root = (await f.authority.prepare(source))!;
    expect(Object.keys(root).sort()).toEqual(["cancel", "finalize"]);
    expect(f.state.inspections).toBe(0);
    let dispatched = 0;
    const context = await root.finalize(source, async (ticket, actor) => {
        dispatched++;
        expect(actor).toEqual(source.actor);
        return ticket;
    });
    expect(f.state.inspections).toBe(1);
    expect((await f.authority.check(f.child(context.ticket))).actor).toEqual(source.actor);
    await expect(
        root.finalize(source, async () => {
            dispatched++;
        }),
    ).rejects.toMatchObject({ code: "not_authorized" });
    expect(dispatched).toBe(1);
});

test("pending roots reject role, revision, activity, expiry, route changes and cancellation before disclosure", async () => {
    for (const change of ["role", "revision", "inactive", "expired", "route", "cancel"] as const) {
        const f = await delegationFixture();
        f.state.actor = { kind: "administrator", subjectId: "user-a", authorizationRevision: 4 };
        const source = f.root();
        const root = (await f.authority.prepare(source))!;
        if (change === "role") {
            f.state.actor = { ...f.state.actor, kind: "user" };
        }
        if (change === "revision") {
            f.state.actor = { ...f.state.actor, authorizationRevision: 5 };
        }
        if (change === "inactive") {
            f.state.actorActive = false;
        }
        if (change === "expired") {
            f.state.now += 30_000;
        }
        if (change === "route") {
            f.routes.isCurrent = async () => false;
        }
        if (change === "cancel") {
            await root.cancel();
        }
        let disclosed = false;
        await expect(
            root.finalize(source, async () => {
                disclosed = true;
            }),
        ).rejects.toMatchObject({ code: "not_authorized" });
        expect(disclosed).toBe(false);
    }
});

test("a prepared root cannot be substituted across a site, request, installation or exact capability release", async () => {
    for (const key of [
        "siteId",
        "requestId",
        "installationId",
        "contractId",
        "version",
        "digest",
        "capabilityId",
    ] as const) {
        const f = await delegationFixture();
        const source = f.root();
        const root = (await f.authority.prepare(source))!;
        await expect(root.finalize({ ...source, [key]: "different" }, async () => "disclosed")).rejects.toMatchObject({
            code: "not_authorized",
        });
        expect(f.state.inspections).toBe(0);
    }
});

test("failed or expired final signing cancels its root, and concurrent finalizations cannot disclose twice", async () => {
    const f = await delegationFixture();
    const source = f.root();
    const root = (await f.authority.prepare(source))!;
    let ticket = "";
    await expect(
        root.finalize(source, async (context) => {
            ticket = context.ticket;
            throw new Error("signing failed");
        }),
    ).rejects.toThrow("signing failed");
    await expect(f.authority.check(f.child(ticket))).rejects.toMatchObject({ code: "not_authorized" });
    const other = (await f.authority.prepare(source))!;
    const results = await Promise.allSettled([0, 1].map(() => other.finalize(source, async (context) => context)));
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const expired = (await f.authority.prepare(source))!;
    await expect(
        expired.finalize(source, async () => {
            f.state.now += 30_000;
        }),
    ).rejects.toMatchObject({ code: "not_authorized" });
});

test("cancellation while the route fence is pending never enters the signing callback", async () => {
    const f = await delegationFixture();
    const source = f.root();
    const root = (await f.authority.prepare(source))!;
    const entered = Promise.withResolvers<void>();
    const route = Promise.withResolvers<boolean>();
    f.routes.isCurrent = async () => {
        entered.resolve();
        return route.promise;
    };
    let disclosed = false;
    const result = root
        .finalize(source, async () => {
            disclosed = true;
        })
        .then(
            () => null,
            (error) => error,
        );
    await entered.promise;
    await root.cancel();
    route.resolve(true);
    expect(await result).toMatchObject({ code: "not_authorized" });
    expect(disclosed).toBe(false);
});
