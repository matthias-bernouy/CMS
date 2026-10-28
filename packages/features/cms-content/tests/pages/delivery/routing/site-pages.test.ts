import { expect, test } from "bun:test";
import { InMemoryContentRepository, createContentReader } from "@bernouy/cms-content";
import { mountPublicPages } from "./publicPage.fixture";

test("copied administration Pages use Content routes and preserve site edits", async () => {
    const repository = new InMemoryContentRepository();
    await repository.insertPage("/admin/custom", "Custom administration", "<main><h1>Custom</h1></main>");
    const page = (await repository.getAllPages())[0]!;
    const published = (await repository.updatePage({ id: page.id, visible: true }, page.revision))!;
    const mounted = mountPublicPages({ repository });
    const response = await mounted.get(new Request("http://admin.test/admin/custom"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Custom administration");
    expect((await createContentReader(repository).getRenderablePage("/admin/custom"))?.source).toEqual({
        kind: "site",
        pageId: page.id,
        revision: published.revision,
    });
    await repository.updatePage({ id: page.id, path: "/admin/mine" }, published.revision);
    expect(await repository.getPageRoute("/admin/custom")).toMatchObject({ state: "redirect", pageId: page.id });
});
