import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository, listCmsPages, PageRevisionConflictError, renameCmsPage } from "@bernouy/cms-content";

describe("ulvia.cms.pages/list implementation", () => {
    test("projects bounded, cursor-based Page metadata across both surfaces", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/public", "Public", undefined, { surface: "delivery" });
        await repository.insertPage("/admin", "Admin", undefined, { surface: "control" });

        const first = await listCmsPages(repository, { limit: 1 });
        const second = await listCmsPages(repository, { cursor: first.nextCursor, limit: 1 });

        expect(first.items).toHaveLength(1);
        expect(second.items).toHaveLength(1);
        expect([...first.items, ...second.items].map(({ surface }) => surface).sort()).toEqual(["control", "delivery"]);
        expect(first.items[0]).not.toHaveProperty("content");
    });

    test("rejects unbounded list inputs", async () => {
        const repository = new InMemoryCmsRepository();
        await expect(listCmsPages(repository, { limit: 101 })).rejects.toThrow(TypeError);
        await expect(listCmsPages(repository, { cursor: "", limit: 1 })).rejects.toThrow(TypeError);
    });
});

describe("ulvia.cms.pages/rename implementation", () => {
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
