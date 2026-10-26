import { expect, test } from "bun:test";
import { createMongoContentRepository } from "../contentMongoFixture";

test("Mongo persists SEO translations alongside a page without changing its routes", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/about", "À propos");
    const page = (await repository.getPage("/about"))!;

    await repository.updatePage({ id: page.id, seo: { en: { title: "About", description: "Company details" } } });
    expect((await repository.getPageById(page.id))?.seo).toEqual({
        en: { title: "About", description: "Company details" },
    });
    expect(await repository.getPageRoute("/about")).toMatchObject({ state: "current", pageId: page.id });
    expect(await repository.getPageRoute("/en/about")).toBeNull();
});
