import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository, listCmsPages } from "@bernouy/cms-content";

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
