import { expect, test } from "bun:test";
import { TrackedDelegationRoots } from "../../../src/runtime/gateway/dispatch/TrackedDelegationRoots";
const context = { ticket: "a".repeat(43), expiresAt: 30_000 };
const closure = { siteId: "default", ticket: context.ticket, requestId: "request" };
test("only registered live roots can delegate; another instance or request cannot close one", () => {
    const roots = new TrackedDelegationRoots(() => 0);
    expect(roots.use(closure)).toBe(false);
    roots.register(context, closure.requestId);
    expect(roots.close({ ...closure, siteId: "another" })).toBe("unknown");
    expect(roots.close({ ...closure, requestId: "another" })).toBe("unknown");
    expect(roots.use({ ...closure, siteId: "another" })).toBe(false);
    expect(roots.use(closure)).toBe(true);
    expect(roots.close(closure)).toBe("used");
    expect(roots.use(closure)).toBe(false);
    expect(roots.batch()).toEqual([]);
});
test("unused closure blocks replay immediately and is acknowledged only after a later control response", () => {
    const roots = new TrackedDelegationRoots(() => 0);
    roots.register(context, closure.requestId);
    expect(roots.close(closure)).toBe("unused");
    expect(roots.use(closure)).toBe(false);
    const batch = roots.batch();
    expect(batch).toEqual([{ ticket: closure.ticket, requestId: closure.requestId }]);
    roots.acknowledge([{ ticket: closure.ticket, requestId: "wrong" }]);
    expect(roots.batch()).toEqual([]);
    roots.release(batch);
    expect(roots.batch()).toEqual(batch);
    roots.acknowledge(batch);
    expect(roots.batch()).toEqual([]);
    expect(roots.use(closure)).toBe(false);
});
test("reservations and queued closures share a finite bound, batches cap at 64 and expiry releases capacity", () => {
    let now = 0;
    const roots = new TrackedDelegationRoots(() => now);
    for (let index = 0; index < 256; index++) {
        const ticket = String(index).padStart(43, "a");
        roots.register({ ticket, expiresAt: 30_000 }, String(index));
        roots.close({ siteId: "default", ticket, requestId: String(index) });
    }
    expect(roots.batch()).toHaveLength(64);
    expect(() => roots.register(context, "overflow")).toThrow("capacity");
    now = 30_000;
    expect(roots.use(closure)).toBe(false);
    expect(roots.batch()).toEqual([]);
    roots.register({ ...context, expiresAt: now + 1 }, "new");
});

test("parallel controls cannot send the same closure batch and failed requests release only their lease", () => {
    const roots = new TrackedDelegationRoots(() => 0);
    roots.register(context, closure.requestId);
    roots.close(closure);
    const first = roots.batch();
    expect(roots.batch()).toEqual([]);
    roots.release(first);
    expect(roots.batch()).toEqual(first);
    roots.acknowledge(first);
    expect(roots.batch()).toEqual([]);
});
