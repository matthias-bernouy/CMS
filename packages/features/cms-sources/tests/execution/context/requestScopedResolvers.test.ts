import { describe, expect, test } from "bun:test";
import {
    createRequestScopedSecretResolver,
    createRequestScopedSourceContextResolver,
} from "@bernouy/cms-sources/requestScope";

describe("request-scoped source resolvers", () => {
    test("single-flights context per Request without leaking into another request", async () => {
        let calls = 0;
        const resolve = createRequestScopedSourceContextResolver(async (request) => {
            calls++;
            return { userID: new URL(request.url).searchParams.get("user") ?? "" };
        });
        const firstRequest = new Request("https://cms.test/source?user=first");
        const contexts = await Promise.all(Array.from({ length: 5 }, () => resolve(firstRequest)));
        contexts[0]!.userID = "mutated";

        expect((await resolve(firstRequest)).userID).toBe("first");
        expect((await resolve(new Request("https://cms.test/source?user=second"))).userID).toBe("second");
        expect(calls).toBe(2);
    });

    test("evicts rejected context promises", async () => {
        let calls = 0;
        const request = new Request("https://cms.test/source");
        const resolve = createRequestScopedSourceContextResolver(async () => {
            calls++;
            if (calls === 1) {
                throw new Error("transient");
            }
            return { userRole: "user" };
        });

        await expect(resolve(request)).rejects.toThrow("transient");
        expect(await resolve(request)).toEqual({ userRole: "user" });
        expect(calls).toBe(2);
    });

    test("single-flights secrets by normalized reference and evicts failures", async () => {
        let calls = 0;
        let reject = false;
        const resolve = createRequestScopedSecretResolver(
            async () => {
                calls++;
                if (reject) {
                    reject = false;
                    throw new Error("transient");
                }
                return "secret";
            },
            (reference) => reference.replace(/^\$\{|\}$/g, ""),
        );

        expect(await Promise.all([resolve("${TOKEN}"), resolve("TOKEN"), resolve("${TOKEN}")])).toEqual([
            "secret",
            "secret",
            "secret",
        ]);
        expect(calls).toBe(1);
        reject = true;
        await expect(resolve("OTHER")).rejects.toThrow("transient");
        expect(await resolve("${OTHER}")).toBe("secret");
        expect(calls).toBe(3);
    });
});
