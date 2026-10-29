import { expect, test } from "bun:test";
import { fixture } from "./root-fixture";
const target = (ticket: string) => ({
    siteId: "default",
    ticket,
    sourceInstallationId: "source",
    sourceCredentialFingerprint: "f".repeat(64),
    contractId: "catalog",
    capabilityId: "read",
});
test("unused roots close locally, cannot replay, and flush with the next preparation rather than a control round trip", async () => {
    const f = fixture();
    const first = f.prepare();
    const issued = await first.result;
    await f.client.delegations.close({
        siteId: "default",
        requestId: first.requestId,
        ticket: issued.delegation!.ticket,
    });
    expect(f.calls).toHaveLength(1);
    await expect(f.client.delegations.check(target(issued.delegation!.ticket))).rejects.toMatchObject({
        code: "not_authorized",
    });
    const second = f.prepare();
    await second.result;
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1]!.input.closedDelegations).toEqual([
        { ticket: issued.delegation!.ticket, requestId: first.requestId },
    ]);
    await f.prepare().result;
    expect(f.calls[2]!.input).not.toHaveProperty("closedDelegations");
});
test("consumed roots still close remotely and a root closed during inspection never returns actor authority", async () => {
    const f = fixture();
    const first = f.prepare();
    const issued = await first.result;
    const blocked = Promise.withResolvers<void>();
    f.block(blocked.promise);
    const checked = f.client.delegations.check(target(issued.delegation!.ticket));
    await Promise.resolve();
    await f.client.delegations.close({
        siteId: "default",
        requestId: first.requestId,
        ticket: issued.delegation!.ticket,
    });
    expect(f.calls.some((item) => item.path.endsWith("/close"))).toBe(true);
    blocked.resolve();
    await expect(checked).rejects.toMatchObject({ code: "not_authorized" });
});
test("failed preparations retain pending closure proofs for an idempotent retry", async () => {
    const f = fixture();
    const first = f.prepare();
    const issued = await first.result;
    await f.client.delegations.close({
        siteId: "default",
        requestId: first.requestId,
        ticket: issued.delegation!.ticket,
    });
    f.fail(true);
    await expect(f.prepare().result).rejects.toThrow();
    f.fail(false);
    await f.prepare().result;
    expect(f.calls[2]!.input.closedDelegations).toEqual(f.calls[1]!.input.closedDelegations);
});
