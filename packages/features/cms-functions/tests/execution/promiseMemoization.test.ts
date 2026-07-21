import { describe, expect, test } from "bun:test";
import { memoizePromise } from "cms-functions/core/execution/promiseMemoization";

describe("function execution promise memoization", () => {
    test("shares one pending load for the same execution key", async () => {
        const cache = new Map<string, Promise<string>>();
        let loads = 0;
        const load = () => {
            loads += 1;
            return Promise.resolve("resolved");
        };

        const first = memoizePromise(cache, "endpoint", load);
        const second = memoizePromise(cache, "endpoint", load);

        expect(first).toBe(second);
        expect(await Promise.all([first, second])).toEqual(["resolved", "resolved"]);
        expect(loads).toBe(1);
    });

    test("evicts a rejected load so the same execution can retry", async () => {
        const cache = new Map<string, Promise<string>>();
        let loads = 0;

        await expect(
            memoizePromise(cache, "secret", () => {
                loads += 1;
                throw new Error("temporary resolver failure");
            }),
        ).rejects.toThrow("temporary resolver failure");

        expect(
            await memoizePromise(cache, "secret", () => {
                loads += 1;
                return "rotated-secret";
            }),
        ).toBe("rotated-secret");
        expect(loads).toBe(2);
    });
});
