import { describe, expect, test } from "bun:test";
import { mountPublicPages, publicPage } from "./publicPage.fixture";

describe("Delivery public page response status", () => {
    test("preserves an explicit provider error status without caching it", async () => {
        const mounted = mountPublicPages({
            providers: [
                {
                    resolvePage: async (path) => ({
                        page: publicPage("repository-unavailable", path, "<main>Repository unavailable</main>"),
                        status: 503,
                    }),
                },
            ],
        });

        const response = await mounted.get(new Request("https://example.test/integrations"));
        const head = await mounted.head(new Request("https://example.test/integrations", { method: "HEAD" }));

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).toContain("Repository unavailable");
        expect(head.status).toBe(503);
        expect(await head.text()).toBe("");
    });
});
