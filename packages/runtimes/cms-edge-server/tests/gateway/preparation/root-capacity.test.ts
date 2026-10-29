import { expect, test } from "bun:test";
import { fixture } from "./root-fixture";
import { TrackedDelegationRoots } from "../../../src/runtime/gateway/dispatch/TrackedDelegationRoots";
import { ControlDelegationAuthority } from "../../../src/runtime/gateway/ControlDelegationAuthority";

test("parallel preparation reserves tracking before emission and rejects excess work without orphaning Provider roots", async () => {
    const f = fixture();
    const roots = await Promise.all(Array.from({ length: 256 }, () => f.prepare().result));
    expect(roots).toHaveLength(256);
    await expect(f.prepare().result).rejects.toMatchObject({ code: "rate_limited" });
    expect(f.calls).toHaveLength(256);
    // An unexpected root returned without a reservation is compensated, never stranded.
    await expect(f.prepare(false).result).rejects.toMatchObject({ code: "not_authorized" });
    expect(f.calls.at(-1)!.path).toBe("/gateway/delegations/close");
    f.rootless();
    expect((await f.prepare(false).result).delegation).toBeNull();
});

test("a full closure queue can free its own reserved slot; failed preparation releases both batch and slot", async () => {
    const f = fixture();
    const calls = Array.from({ length: 256 }, () => f.prepare());
    const values = await Promise.all(calls.map((call) => call.result));
    await Promise.all(
        values.map((value, index) =>
            f.client.delegations.close({
                siteId: "default",
                ticket: value.delegation!.ticket,
                requestId: calls[index]!.requestId,
            }),
        ),
    );
    f.fail(true);
    await expect(f.prepare().result).rejects.toThrow();
    f.fail(false);
    const next = await f.prepare().result;
    expect(next.delegation).not.toBeNull();
    expect(f.calls.at(-1)!.input.closedDelegations).toHaveLength(64);
    expect(f.calls.at(-1)!.input.closedDelegations).toEqual(f.calls.at(-2)!.input.closedDelegations);
});

test("standalone issuance reserves before the remote call, releases failed reservations and closes a returned root rejected locally", async () => {
    const roots = new TrackedDelegationRoots(() => 0, 1);
    const actions: string[] = [];
    let expiresAt = 30_000;
    let fail = true;
    const authority = new ControlDelegationAuthority(async (id) => {
        actions.push(id);
        if (fail) {
            throw new Error("network");
        }
        return id.endsWith("close") ? { accepted: true } : { delegation: { ticket: "a".repeat(43), expiresAt } };
    }, roots);
    const source = { siteId: "default", requestId: crypto.randomUUID() } as Parameters<typeof authority.issue>[0];
    await expect(authority.issue(source)).rejects.toMatchObject({ code: "transport_failure" });
    fail = false;
    expiresAt = -1;
    await expect(authority.issue(source)).rejects.toMatchObject({ code: "not_authorized" });
    expect(actions).toEqual(["gateway.delegation.issue", "gateway.delegation.issue", "gateway.delegation.close"]);
    expiresAt = 30_000;
    expect(await authority.issue(source)).not.toBeNull();
    await expect(authority.issue(source)).rejects.toMatchObject({ code: "rate_limited" });
    expect(actions).toHaveLength(4);
});
