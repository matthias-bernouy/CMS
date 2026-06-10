import { describe, test, expect } from "bun:test";
import { InMemoryRateLimiter } from "cms-auth/default-implementation/InMemoryRateLimiter";

describe("InMemoryRateLimiter", () => {
    test("allows up to the limit, then blocks with a retry hint", async () => {
        const rl = new InMemoryRateLimiter({ limit: 3, windowSeconds: 60 });
        expect((await rl.hit("k")).allowed).toBe(true);
        expect((await rl.hit("k")).allowed).toBe(true);
        expect((await rl.hit("k")).allowed).toBe(true);
        const blocked = await rl.hit("k");
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    test("keys are independent", async () => {
        const rl = new InMemoryRateLimiter({ limit: 1, windowSeconds: 60 });
        expect((await rl.hit("a")).allowed).toBe(true);
        expect((await rl.hit("b")).allowed).toBe(true); // different key, fresh budget
        expect((await rl.hit("a")).allowed).toBe(false);
    });

    test("reset clears the counter", async () => {
        const rl = new InMemoryRateLimiter({ limit: 1, windowSeconds: 60 });
        await rl.hit("k");
        expect((await rl.hit("k")).allowed).toBe(false);
        await rl.reset("k");
        expect((await rl.hit("k")).allowed).toBe(true);
    });

    test("the window expires and a fresh budget opens", async () => {
        const rl = new InMemoryRateLimiter({ limit: 1, windowSeconds: 0.05 });
        expect((await rl.hit("k")).allowed).toBe(true);
        expect((await rl.hit("k")).allowed).toBe(false);
        await Bun.sleep(70);
        expect((await rl.hit("k")).allowed).toBe(true);
    });
});
