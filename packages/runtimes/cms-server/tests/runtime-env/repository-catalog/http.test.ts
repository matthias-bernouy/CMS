import { describe, expect, test } from "bun:test";
import { HttpRepositoryCatalogReader } from "../../../src/repositoryCatalog";
import { catalogFixture, FixtureDefinitionRepository } from "./fixtures";

describe("repository catalog HTTP policy", () => {
    test("sends only anonymous same-origin requests without forwarding browser or service secrets", async () => {
        const fixture = catalogFixture();

        await fixture.reader.getVersion("commerce", "1.0.0");

        expect(fixture.requests.length).toBeGreaterThan(0);
        for (const { url, init } of fixture.requests) {
            expect(url.origin).toBe("https://repository.example");
            expect(url.pathname.startsWith("/.cms/repository/api/integrations/")).toBe(true);
            expect(init?.credentials).toBe("omit");
            expect(init?.redirect).toBe("error");
            expect(init?.body).toBeUndefined();
            const headers = new Headers(init?.headers);
            expect([...headers.keys()]).toEqual(["accept"]);
            expect(headers.has("authorization")).toBe(false);
            expect(headers.has("cookie")).toBe(false);
            expect(headers.has("x-forwarded-for")).toBe(false);
            expect(url.search.toLowerCase()).not.toContain("token");
            expect(url.search.toLowerCase()).not.toContain("secret");
        }
    });

    test("keeps the timeout active while a bounded response body is being read", async () => {
        const fixture = catalogFixture();
        const stalledFetch: typeof fetch = async (input, init) => {
            const url = new URL(String(input));
            if (!url.pathname.endsWith("/release-notes")) {
                return await fixture.fetch(input, init);
            }
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("partial"));
                    init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), {
                        once: true,
                    });
                },
            });
            return new Response(body, {
                headers: {
                    "content-length": "20",
                    "content-type": "text/markdown",
                    etag: `"${"e".repeat(64)}"`,
                },
            });
        };
        const reader = new HttpRepositoryCatalogReader({
            catalog: new FixtureDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: stalledFetch,
            timeoutMs: 5,
        });

        await expect(reader.getVersion("commerce", "1.0.0")).rejects.toMatchObject({ status: 503 });
    });
});
