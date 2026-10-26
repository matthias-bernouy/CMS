import { expect, test } from "bun:test";
import { createMongoContentRepository } from "../contentMongoFixture";

test("Mongo moves the primary path when the default language changes", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/about", "About");
    const page = (await repository.getPage("/about"))!;

    await repository.updateSystem({
        site: { language: "en", additionalLanguages: ["fr"], activeLanguages: ["fr"] } as never,
    });
    expect(await repository.getPageById(page.id)).toMatchObject({
        path: "/about",
        paths: { en: "/about", fr: "/about" },
    });
    expect(await repository.getPageRoute("/about")).toMatchObject({
        state: "current",
        pageId: page.id,
        language: "en",
    });
    expect(await repository.getPageRoute("/fr/about")).toMatchObject({
        state: "current",
        pageId: page.id,
        language: "fr",
    });
    await repository.init();
    expect((await repository.getPageById(page.id))?.path).toBe("/about");
    expect(await repository.getPageRoute("/about")).toMatchObject({ language: "en" });
});

test("Mongo stores a new page path as local even when it begins with the language prefix", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await repository.insertPage("/fr/about", "About");
    expect((await repository.getPage("/fr/about"))?.paths).toEqual({ fr: "/fr/about" });
    expect(await repository.getPageRoute("/fr/fr/about")).toBeNull();
});

test("Mongo updates a default-language path without stripping a literal prefix", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "en" } as never });
    await repository.insertPage("/before", "Before");
    const page = (await repository.getPage("/before"))!;

    await repository.updatePage({ id: page.id, path: "/en/about" });
    expect((await repository.getPageById(page.id))?.paths).toEqual({ en: "/en/about" });
    expect((await repository.getPageById(page.id))?.path).toBe("/en/about");
    expect(await repository.getPageRoute("/en/about")).toMatchObject({ state: "current", pageId: page.id });
    expect(await repository.getPageRoute("/about")).toBeNull();
});

test("Mongo ignores paths passed through a generic page update", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/about", "About");
    const page = (await repository.getPage("/about"))!;

    await repository.updatePage({ id: page.id, title: "Updated", paths: { fr: "/about", en: "/unreserved" } });
    expect((await repository.getPageById(page.id))?.paths).toEqual({ fr: "/about" });
    expect(await repository.getPageRoute("/en/unreserved")).toBeNull();
});
