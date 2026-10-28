import { expect, test } from "bun:test";
import { createContentReader, InMemoryContentRepository } from "@bernouy/cms-content";
import { mountPublicPages } from "./publicPage.fixture";

test("non-Page request paths render the configured fallback without querying the route registry", async () => {
    const repository = new InMemoryContentRepository();
    await repository.insertPage("/not-found", "Not found", "<main>Configured fallback</main>");
    const fallback = (await repository.getPage("/not-found"))!;
    await repository.updatePage({ id: fallback.id, visible: true });
    await repository.updateSystem({ site: { notFound: { kind: "site", pageId: fallback.id } } as never });

    const content = createContentReader(repository);
    let routeLookups = 0;
    const mounted = mountPublicPages({
        repository: {
            ...content,
            resolveRenderableRoute: async (path) => {
                routeLookups += 1;
                return content.resolveRenderableRoute(path);
            },
        },
    });

    for (const path of ["/.well-known/appspecific/com.chrome.devtools.json", "/favicon.json", "/api/missing"]) {
        const response = await mounted.get(new Request(`https://example.test${path}`));
        expect(response.status).toBe(404);
        expect(await response.text()).toContain("Configured fallback");
    }
    expect(routeLookups).toBe(0);
});
