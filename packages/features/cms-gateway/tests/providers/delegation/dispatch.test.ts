import { CapabilityGateway } from "@bernouy/cms-gateway";
import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { DELEGATION_LIMITS, InMemoryDelegationStore } from "@bernouy/cms-gateway/access/delegation";
import { NOW } from "../../fixtures";
import { delegationFixture } from "./fixtures";

test("dispatch fence rereads mutable authorization without resolving the catalogue again", async () => {
    for (const change of ["credential", "actor", "grants", "route", "closed", "expired"] as const) {
        const f = await delegationFixture();
        const root = f.root();
        const ticket = (await f.authority.issue(root))!;
        let resolves = 0;
        const resolve = f.routes.resolve;
        f.routes.resolve = async (...args) => {
            resolves++;
            return resolve(...args);
        };
        const proof = await f.authority.authorize(f.child(ticket.ticket), 0);
        expect(resolves).toBe(2);
        await proof.assertCurrent();
        expect(resolves).toBe(2);
        if (change === "credential") {
            f.state.credential = "rotated";
        }
        if (change === "actor") {
            f.state.actor = { kind: "user", subjectId: "changed", authorizationRevision: 2 };
        }
        if (change === "grants") {
            f.state.current.grants.denied.push({ contractId: "destination", capabilityId: "item.list" });
        }
        if (change === "route") {
            f.routes.isCurrent = async () => false;
        }
        if (change === "closed") {
            await f.authority.close({ siteId: "site-a", ticket: ticket.ticket, requestId: root.requestId });
        }
        if (change === "expired") {
            f.state.now += DELEGATION_LIMITS.lifetimeMs;
        }
        await expect(proof.assertCurrent()).rejects.toMatchObject({ code: "not_authorized" });
        expect(resolves).toBe(2);
    }
});

test("memory ticket capacity and hash uniqueness are scoped by site", async () => {
    const f = await delegationFixture();
    const ticket = (await f.authority.issue(f.root()))!;
    const store = new InMemoryDelegationStore();
    const source = await f.store.get(
        "site-a",
        createHash("sha256").update(`ulvia-delegation-v1\0${ticket.ticket}`).digest("hex"),
        f.state.now,
    );
    expect(source).not.toBeNull();
    for (let i = 0; i < DELEGATION_LIMITS.activeTicketsPerSite; i++) {
        expect(await store.create({ ...source!, hash: String(i) }, f.state.now)).toBeTrue();
    }
    expect(await store.create({ ...source!, hash: "overflow" }, f.state.now)).toBeFalse();
    const other = { ...source!, siteId: "site-b", hash: "0" };
    expect(await store.create(other, f.state.now)).toBeTrue();
    expect((await store.get("site-a", "0", f.state.now))?.siteId).toBe("site-a");
    await store.close("site-b", "0", other.source.requestId);
    expect(await store.get("site-b", "0", f.state.now)).toBeNull();
    expect(await store.get("site-a", "0", f.state.now)).not.toBeNull();
});

test("a brokered child resolves its actor once and never mints a recursive ticket", async () => {
    const f = await delegationFixture({
        targetPolicy: { sources: ["*"], allow: [{ contractId: "*", capabilityId: "*", effect: "query" }] },
    });
    const ticket = (await f.authority.issue(f.root()))!;
    let checks = 0;
    const gateway = new CapabilityGateway({
        routes: f.routes,
        now: () => NOW,
        transportFencesRoute: true,
        authorize: async () => true,
        delegations: {
            issue: async () => {
                throw new Error("A child must never issue another ticket");
            },
            check: async (...args) => {
                checks++;
                return f.authority.check(...args);
            },
            close: (input) => f.authority.close(input),
        },
        transport: {
            send: async (request) => {
                expect(request.delegation).toBeUndefined();
                expect(request.delegated?.ticket).toBe(ticket.ticket);
                return { output: { items: [] } };
            },
        },
    });
    expect(
        (
            await gateway.invoke({
                siteId: "site-a",
                contractId: "destination",
                capabilityId: "item.list",
                input: {},
                actor: {
                    kind: "provider",
                    installationId: "origin-install",
                    credentialFingerprint: f.state.credential,
                },
                delegationTicket: ticket.ticket,
            })
        ).kind,
    ).toBe("success");
    expect(checks).toBe(1);
});
