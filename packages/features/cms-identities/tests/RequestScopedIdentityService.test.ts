import { describe, expect, test } from "bun:test";
import type { IdentityAlias, IdentityService, IdentityValue } from "@bernouy/cms-identities";
import { RequestScopedIdentityService } from "@bernouy/cms-identities/requestScope";

const alias: IdentityAlias = { authority: "provider", kind: "user", value: "external-1" };

describe("RequestScopedIdentityService", () => {
    test("single-flights resolutions, including null, for one scope", async () => {
        const inner = new CountingIdentityService("cms-1");
        const scoped = new RequestScopedIdentityService(inner);

        expect(await Promise.all(Array.from({ length: 5 }, () => scoped.resolve(alias, "cms")))).toEqual(
            Array(5).fill("cms-1"),
        );
        expect(inner.resolveCalls).toBe(1);

        inner.value = null;
        await Promise.all([
            scoped.resolve({ ...alias, value: "missing" }, "cms"),
            scoped.resolve(
                {
                    ...alias,
                    value: "missing",
                },
                "cms",
            ),
        ]);
        expect(inner.resolveCalls).toBe(2);
    });

    test("evicts rejected lookups and clears resolutions after binding", async () => {
        const inner = new CountingIdentityService("before");
        const scoped = new RequestScopedIdentityService(inner);
        inner.rejectOnce = true;

        await expect(scoped.resolve(alias, "cms")).rejects.toThrow("transient");
        expect(await scoped.resolve(alias, "cms")).toBe("before");
        inner.value = "after";
        await scoped.bind("cms-1", alias);
        expect(await scoped.resolve(alias, "cms")).toBe("after");
        expect(inner.resolveCalls).toBe(3);
    });
});

class CountingIdentityService implements IdentityService {
    resolveCalls = 0;
    rejectOnce = false;

    constructor(public value: IdentityValue | null) {}

    async resolve(): Promise<IdentityValue | null> {
        this.resolveCalls++;
        if (this.rejectOnce) {
            this.rejectOnce = false;
            throw new Error("transient");
        }
        return this.value;
    }

    async bind(): Promise<void> {}
}
