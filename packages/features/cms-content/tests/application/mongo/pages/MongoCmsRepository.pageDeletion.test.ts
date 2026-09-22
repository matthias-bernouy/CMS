import { expect, test } from "bun:test";
import { DuplicatePagePathError } from "@bernouy/cms-content";
import { createMongoContentRepository } from "../contentMongoFixture";

test("Mongo keeps deleted current and historical URLs gone and reserved", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/old", "Old");
    const old = (await repository.getPage("/old"))!;
    await repository.setPagePaths(old.id, { fr: "/new", en: "/old" });

    await repository.deletePage(old.id);
    await repository.init();
    for (const path of ["/old", "/new", "/en/old"]) {
        expect(await repository.getPageRoute(path)).toMatchObject({ state: "gone", pageId: old.id });
    }
    await expect(repository.insertPage("/old", "Reuse")).rejects.toBeInstanceOf(DuplicatePagePathError);
    await repository.insertPage("/another", "Another");
    const another = (await repository.getPage("/another"))!;
    await expect(repository.setPagePaths(another.id, { fr: "/new" })).rejects.toBeInstanceOf(DuplicatePagePathError);
});

test("Mongo redirects inherited URLs through replacement pages and makes them gone on final deletion", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    for (const path of ["/first", "/second", "/third"]) {
        await repository.insertPage(path, path);
        const page = (await repository.getPage(path))!;
        await repository.updatePage({ id: page.id, visible: true });
    }
    const first = (await repository.getPage("/first"))!;
    const second = (await repository.getPage("/second"))!;
    const third = (await repository.getPage("/third"))!;
    await repository.setPagePaths(first.id, { fr: "/first", en: "/first" });
    await repository.setPagePaths(first.id, { fr: "/first" });
    expect(await repository.getPageRoute("/en/first")).toMatchObject({ state: "redirect", language: "en" });

    await repository.deletePageWithAlternative(first.id, second.id);
    expect(await repository.getPageRoute("/en/first")).toMatchObject({
        state: "redirect",
        pageId: second.id,
        ownerPageId: first.id,
        language: "en",
    });
    await repository.deletePageWithAlternative(second.id, third.id);
    expect(await repository.getPageRoute("/first")).toMatchObject({ state: "redirect", pageId: third.id });
    expect(await repository.getPageRoute("/en/first")).toMatchObject({ state: "redirect", pageId: third.id });

    await repository.deletePage(third.id);
    await repository.init();
    for (const path of ["/first", "/en/first", "/second", "/third"]) {
        expect(await repository.getPageRoute(path)).toMatchObject({ state: "gone", pageId: third.id });
    }
    await expect(repository.insertPage("/first", "Reuse")).rejects.toBeInstanceOf(DuplicatePagePathError);
});
