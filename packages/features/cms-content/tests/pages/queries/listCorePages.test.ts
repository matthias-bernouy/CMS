import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository, listCmsPages, PageRevisionConflictError, renameCmsPage } from "@bernouy/cms-content";

describe("ulvia.cms.content/pages.list implementation", () => {
    test("projects bounded, cursor-based Page metadata", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/public", "Public");
        await repository.insertPage("/admin", "Admin");

        const first = await listCmsPages(repository, { limit: 1 });
        const second = await listCmsPages(repository, { cursor: first.nextCursor, limit: 1 });

        expect(first.items).toHaveLength(1);
        expect(second.items).toHaveLength(1);
        expect([...first.items, ...second.items].map(({ path }) => path).sort()).toEqual(["/admin", "/public"]);
        expect(first.items[0]).not.toHaveProperty("content");
    });

    test("keeps pagination stable when several Pages share a title", async () => {
        const repository = new InMemoryCmsRepository();
        for (const path of ["/one", "/two", "/three"]) {
            await repository.insertPage(path, "Same title");
        }

        const first = await listCmsPages(repository, { limit: 2 });
        const second = await listCmsPages(repository, { cursor: first.nextCursor, limit: 2 });

        expect([...first.items, ...second.items].map(({ id }) => id)).toHaveLength(3);
        expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(3);
    });

    test("rejects unbounded list inputs", async () => {
        const repository = new InMemoryCmsRepository();
        await expect(listCmsPages(repository, { limit: 101 })).rejects.toThrow(TypeError);
        await expect(listCmsPages(repository, { cursor: "", limit: 1 })).rejects.toThrow(TypeError);
        await expect(listCmsPages(repository, { query: "x".repeat(121) })).rejects.toThrow(TypeError);
        await expect(listCmsPages(repository, { visibility: "hidden" as never })).rejects.toThrow(TypeError);
    });

    test("filters Page metadata without exposing editorial documents", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/about", "About");
        await repository.insertPage("/journal", "Journal");
        const journal = await repository.getPage("/journal");
        await repository.updatePage({ id: journal!.id, visible: true }, journal!.revision);

        expect((await listCmsPages(repository, { query: "about" })).items.map(({ title }) => title)).toEqual(["About"]);
        expect((await listCmsPages(repository, { visibility: "published" })).items.map(({ title }) => title)).toEqual([
            "Journal",
        ]);
    });
});

describe("ulvia.cms.content/pages.rename implementation", () => {
    test("renames with optimistic concurrency and makes an exact retry naturally idempotent", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/public", "Before");
        const [page] = await repository.getAllPages();

        const renamed = await renameCmsPage(repository, {
            id: page!.id,
            title: "After",
            expectedRevision: page!.revision,
        });
        const retried = await renameCmsPage(repository, {
            id: page!.id,
            title: "After",
            expectedRevision: page!.revision,
        });

        expect(renamed).toEqual(retried);
        expect(renamed).toMatchObject({ title: "After", revision: page!.revision + 1 });
    });

    test("rejects a stale revision that does not describe the completed command", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/public", "Before");
        const [page] = await repository.getAllPages();
        await renameCmsPage(repository, { id: page!.id, title: "First", expectedRevision: page!.revision });

        await expect(
            renameCmsPage(repository, { id: page!.id, title: "Different", expectedRevision: page!.revision }),
        ).rejects.toBeInstanceOf(PageRevisionConflictError);
    });
});
