import { test, expect } from "bun:test";
import { MemoryJtiStore } from "src/default-implementation/MemoryJtiStore";

const store = () => new MemoryJtiStore(() => 1000);

test("claim: first use true, replay false", async () => {
    const s = store();
    expect(await s.claim("jti-1", 1100)).toBe(true);
    expect(await s.claim("jti-1", 1100)).toBe(false);   // replay
});

test("claim: concurrent claims of the same jti → exactly one wins (atomic)", async () => {
    const s = store();
    const results = await Promise.all(
        Array.from({ length: 8 }, () => s.claim("jti-race", 1100)),
    );
    expect(results.filter(Boolean).length).toBe(1);     // single-use under concurrency
});

test("claim: an expired jti can be claimed again (per-key expiry check)", async () => {
    let t = 1000;
    const s = new MemoryJtiStore(() => t);
    expect(await s.claim("jti-2", 1050)).toBe(true);
    t = 1051;                                            // past expiry
    expect(await s.claim("jti-2", 1200)).toBe(true);     // fresh claim, not a replay
});
