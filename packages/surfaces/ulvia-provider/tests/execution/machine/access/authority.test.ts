import { expect, test } from "bun:test";
import { accessServices } from "./services";
import { accessTransport } from "./transport";

test("Access pages make one membership query and one grant read per returned row, and reject invalid pages before reads", async () => {
    const ports = accessServices();
    for (let index = 0; index < 3; index++) {
        await ports.users.upsert({ sub: `member-${index}` });
    }
    const counts = { queries: 0, loaded: 0, grants: 0 };
    const list = ports.users.list.bind(ports.users);
    ports.users.list = async (input) => {
        counts.queries++;
        const page = await list(input);
        counts.loaded += page.users.length;
        return page;
    };
    ports.governance.administrators.get = async (sub) => {
        counts.grants++;
        return { sub, enabled: false, revision: 0, bootstrap: false };
    };
    const { call } = await accessTransport(ports);
    expect((await call("list-users", { page: 0, limit: 2 })).status).toBe(400);
    expect(counts).toEqual({ queries: 0, loaded: 0, grants: 0 });
    const first = await call("list-users", { page: 1, limit: 2 });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ page: 1, limit: 2, total: 3, hasMore: true });
    expect(counts).toEqual({ queries: 1, loaded: 2, grants: 2 });
    const second = await call("list-users", { page: 2, limit: 2 });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ page: 2, total: 3, hasMore: false });
    expect(counts).toEqual({ queries: 2, loaded: 3, grants: 3 });
});

test("Access actor inspection accepts only the trusted gateway system authority and rejects another instance before reads", async () => {
    const ports = accessServices();
    await ports.users.upsert({ sub: "member" });
    let reads = 0;
    const get = ports.users.getBySub.bind(ports.users);
    ports.users.getBySub = async (sub) => {
        reads++;
        return get(sub);
    };
    const { call } = await accessTransport(ports);
    for (const context of [
        {},
        { systemServiceId: "other" },
        { systemServiceId: "cms-gateway", subjectId: "member" },
        { systemServiceId: "cms-gateway", sourceInstallationId: "untrusted" },
    ]) {
        const response = await call("inspect-actor", { subjectId: "member" }, context);
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
    }
    expect(reads).toBe(0);
    const foreign = await call(
        "inspect-actor",
        { subjectId: "member" },
        { systemServiceId: "cms-gateway", invocation: { contractId: "ulvia/cms.access", instanceId: "foreign" } },
    );
    expect(foreign.ok).toBe(false);
    expect(reads).toBe(0);
    const allowed = await call("inspect-actor", { subjectId: "member" }, { systemServiceId: "cms-gateway" });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ state: "authenticated", subjectId: "member", administrator: false });
    expect(reads).toBe(1);
});

test("Access protected deletion and stale grant revisions leave membership and credentials unchanged", async () => {
    const ports = accessServices();
    await ports.users.upsert({ sub: "member" });
    ports.governance.identities.resolve = async () => "actor";
    ports.governance.administrators.canRevoke = async () => false;
    ports.governance.administrators.set = async () => {
        throw Object.assign(new Error("private revision details"), { status: 409 });
    };
    const { call } = await accessTransport(ports);
    const protectedUser = await call("delete-user", { sub: "member" }, { subjectId: "actor-alias" });
    expect(protectedUser.status).toBe(409);
    expect((await protectedUser.json()).error.code).toBe("PROTECTED_USER");
    const stale = await call(
        "set-administrator",
        { sub: "member", enabled: true, expectedRevision: 0 },
        { subjectId: "actor-alias" },
    );
    expect(stale.status).toBe(409);
    const text = await stale.text();
    expect(text).toContain("REVISION_CONFLICT");
    expect(text).not.toContain("private revision details");
    expect(await ports.users.getBySub("member")).not.toBeNull();
});
