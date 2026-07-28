import { describe, expect, test } from "bun:test";
import { mountPublicPages, publicPage } from "./publicPage.fixture";

describe("Delivery public page request context", () => {
    test("never mixes query-dependent provider output through the render cache", async () => {
        let resolutions = 0;
        const mounted = mountPublicPages({
            providers: [
                {
                    resolvePage: async (path, context) => ({
                        page: publicPage(
                            "filtered",
                            path,
                            `<main>FILTER_${context.searchParams.q?.[0] ?? "all"}_${++resolutions}</main>`,
                        ),
                        cacheIdentity: "catalog-revision-1",
                    }),
                },
            ],
        });

        const commerce = await mounted.get(new Request("https://example.test/integrations?q=commerce"));
        const payments = await mounted.get(new Request("https://example.test/integrations?q=payments"));

        expect(await commerce.text()).toContain("FILTER_commerce_1");
        expect(await payments.text()).toContain("FILTER_payments_2");
        expect(commerce.headers.get("cache-control")).toBe("no-store");
        expect(payments.headers.get("cache-control")).toBe("no-store");
    });

    test("rejects hostile query shapes before provider work", async () => {
        let calls = 0;
        const mounted = mountPublicPages({
            providers: [
                {
                    resolvePage: async () => {
                        calls += 1;
                        return null;
                    },
                },
            ],
        });

        for (const query of ["?bad=%GG", `?q=${"x".repeat(4_097)}`, `?${"x=1&".repeat(33)}`]) {
            const response = await mounted.get(new Request(`https://example.test/integrations${query}`));
            expect(response.status).toBe(400);
            expect(response.headers.get("cache-control")).toBe("no-store");
        }
        expect(calls).toBe(0);
    });
});
