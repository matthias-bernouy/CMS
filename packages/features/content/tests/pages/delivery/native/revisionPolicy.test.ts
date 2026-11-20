import { expect, test } from "bun:test";
import { InMemoryContentRepository, createContentReader } from "@bernouy/content";
import { ContentDelivery } from "@bernouy/content/public-delivery";
import { InMemoryCache } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { deliveryCacheTags } from "content/application/core/capabilities/delivery";

const SOURCE_REVISION = "11111111-1111-4111-8111-111111111111";
async function fixture(content: string, revision: string | null = SOURCE_REVISION) {
    const repo = new InMemoryContentRepository();
    await repo.insertPage("/page", "Static Page", content);
    const page = (await repo.getAllPages())[0]!;
    await repo.updatePage({ id: page.id, visible: true }, page.revision);
    let svgCalls = 0;
    const delivery = new ContentDelivery({
        content: createContentReader(repo),
        cache: new InMemoryCache(),
        logger: NOOP_LOGGER,
        publicUrl: "https://site.test",
        ...(revision ? { readResourceRevision: async () => revision } : {}),
        resolveContributedAssets: async (value) => value,
        pageCapabilities: { requiredAccess: async () => "public" },
        resolveSvgSources: async (sources) => {
            svgCalls++;
            return new Map(
                sources.map((source) => [
                    source,
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h1"/></svg>',
                ]),
            );
        },
    });
    return {
        svgCalls: () => svgCalls,
        read: (kind: "anonymous" | "administrator" = "anonymous") =>
            delivery.resolvePath({ path: "/page", method: "GET", query: [] }, { kind }),
    };
}
test("static public artifact evidence survives Response adaptation but never follows an authenticated response", async () => {
    const f = await fixture("<p>Static public content</p>");
    for (let index = 0; index < 2; index++) {
        const response = await f.read();
        expect(response.status).toBe(200);
        expect(deliveryCacheTags(response)).toContain(`content:revision-validated:${SOURCE_REVISION}`);
        expect(response.headers.get("cache-control")).toBe("public, no-cache, s-maxage=15");
        await response.body?.cancel();
    }
    const authenticated = await f.read("administrator");
    expect(authenticated.headers.get("cache-control")).toBe("private, no-store");
    expect(deliveryCacheTags(authenticated)).not.toContain(`content:revision-validated:${SOURCE_REVISION}`);
    await authenticated.body?.cancel();
});
test("live binding and capability-SVG artifacts never opt into revision-only reuse, including warm artifacts", async () => {
    for (const content of [
        '<section cms-query="ulvia/public:read as item"><p>{{ item }}</p></section>',
        '<svg cms-svg="/.cms/call/ulvia/cms.files/files/example/generation" aria-hidden="true"></svg>',
    ]) {
        const f = await fixture(content);
        for (let index = 0; index < 2; index++) {
            const response = await f.read();
            expect(response.status).toBe(200);
            expect(deliveryCacheTags(response)).not.toContain(`content:revision-validated:${SOURCE_REVISION}`);
            await response.body?.cancel();
        }
        if (content.includes("cms-svg")) {
            expect(f.svgCalls()).toBeGreaterThan(0);
        }
    }
});

test("a static result without its producing instance clock never offers revision-based reuse", async () => {
    const f = await fixture("<p>Unbound static content</p>", null);
    const response = await f.read();
    expect(response.status).toBe(200);
    expect(deliveryCacheTags(response)).toEqual(["content:pages"]);
    await response.body?.cancel();
});
