import { expect, test } from "bun:test";
import { ContentValidationError, DuplicatePagePathError } from "@bernouy/cms-content";
import { createMongoContentRepository } from "../contentMongoFixture";

test("Mongo migrates legacy URLs and keeps route lookups indexed", async () => {
    const { db, repository } = createMongoContentRepository();
    await db.get("pages").insertOne({
        _id: "legacy-page",
        path: "/about",
        title: "About",
        content: "<p>About</p>",
        description: "",
        visible: true,
        tags: [],
    });
    await repository.init();
    expect(db.get("page_routes").indexes).toContainEqual({ keys: { pageId: 1 }, options: undefined });
    await repository.updateSystem({
        site: { language: "fr", additionalLanguages: ["en"], activeLanguages: ["en"] } as never,
    });
    expect(await repository.getPageRoute("/about")).toMatchObject({ state: "current", pageId: "legacy-page" });
    expect((await repository.getPageById("legacy-page"))?.path).toBe("/about");

    await repository.setPagePaths("legacy-page", { fr: "/a-propos", en: "/about" });
    expect(await repository.getPageRoute("/about")).toMatchObject({ state: "redirect" });
    expect(await repository.getPageRoute("/en/about")).toMatchObject({ state: "current" });
    await expect(repository.insertPage("/about", "Reuse")).rejects.toBeInstanceOf(DuplicatePagePathError);

    await repository.init();
    expect((await repository.getPageById("legacy-page"))?.paths).toEqual({ fr: "/a-propos", en: "/about" });
    await repository.deletePage("legacy-page");
    expect(await repository.getPageRoute("/about")).toMatchObject({ state: "gone" });
});

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

test("Mongo startup repairs the language of an existing current route", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    await repository.insertPage("/about", "About");
    await db.get("page_routes").updateOne({ _id: "/about" }, { $set: { language: "fr" } });

    await repository.init();
    expect(await repository.getPageRoute("/about")).toMatchObject({ state: "current", language: "en" });
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

test("Mongo reserves the sitemap namespace at the root and under language prefixes", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await expect(repository.insertPage("/sitemaps", "Reserved")).rejects.toBeInstanceOf(ContentValidationError);
    await expect(repository.insertPage("/en/sitemaps/old", "Reserved")).rejects.toBeInstanceOf(ContentValidationError);
    await repository.insertPage("/products/sitemaps", "Products sitemap guide");
    expect((await repository.getPage("/products/sitemaps"))?.path).toBe("/products/sitemaps");
    await repository.insertPage("/about", "About");
    const page = (await repository.getPage("/about"))!;
    await expect(repository.setPagePaths(page.id, { fr: "/sitemaps" })).rejects.toBeInstanceOf(ContentValidationError);
    await expect(repository.setPagePaths(page.id, { fr: "/about", en: "/sitemaps" })).rejects.toBeInstanceOf(
        ContentValidationError,
    );
    expect(await repository.getPageRoute("/en/sitemaps")).toBeNull();
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

test("Mongo keeps legacy root paths when adding the default language", async () => {
    const { db, repository } = createMongoContentRepository();
    await db.get("pages").insertOne({
        _id: "first",
        path: "/about",
        title: "First",
        content: "<p>First</p>",
        description: "",
        visible: true,
        tags: [],
    });
    await db.get("pages").insertOne({
        _id: "second",
        path: "/fr/about",
        title: "Second",
        content: "<p>Second</p>",
        description: "",
        visible: true,
        tags: [],
    });
    await repository.init();
    expect(await repository.getPageRoute("/about")).toMatchObject({ state: "current", pageId: "first" });
    await repository.updateSystem({ site: { language: "fr" } as never });
    expect((await repository.getPageById("first"))?.path).toBe("/about");
    expect((await repository.getPageById("second"))?.path).toBe("/fr/about");
    expect((await repository.getSystem()).site.language).toBe("fr");
});

test("Mongo promotes an old unprefixed redirect and retires its prefixed default URL", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await db.get("pages").insertOne({
        _id: "page-1",
        path: "/fr/about",
        paths: { fr: "/about" },
        title: "About",
        content: "<p>About</p>",
        description: "",
        visible: true,
        tags: [],
    });
    await db.get("page_routes").insertOne({
        _id: "/fr/about",
        state: "current",
        pageId: "page-1",
        language: "fr",
    });
    await db.get("page_routes").insertOne({
        _id: "/about",
        state: "redirect",
        pageId: "page-1",
        language: "fr",
    });

    await repository.init();
    expect((await repository.getPageById("page-1"))?.path).toBe("/about");
    expect(await repository.getPageRoute("/about")).toMatchObject({
        state: "current",
        pageId: "page-1",
        ownerPageId: "page-1",
    });
    expect(await repository.getPageRoute("/fr/about")).toMatchObject({ state: "redirect" });
    await repository.init();
    expect((await repository.getPageById("page-1"))?.path).toBe("/about");
});
