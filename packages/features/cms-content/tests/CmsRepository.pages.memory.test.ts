import { describe, test, expect } from "bun:test";
import { countValues, DuplicatePagePathError, InMemoryCmsRepository, isPublishedPage } from "@bernouy/cms-content";

/** Seed three pages with distinct titles/paths/tags/visibility. */
async function seeded() {
    const repo = new InMemoryCmsRepository();
    const rows = [
        { path: "/about", title: "About us", tags: ["company"], visible: true },
        { path: "/blog", title: "Blog", tags: ["news"], visible: false },
        { path: "/contact", title: "Contact", tags: ["company"], visible: true },
    ];
    for (const r of rows) {
        await repo.insertPage(r.path, r.title);
        const p = await repo.getPage(r.path);
        await repo.updatePage({ id: p!.id, path: r.path, title: r.title, tags: r.tags, visible: r.visible });
    }
    return repo;
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe("InMemoryCmsRepository.getPagesMetadata — filter + sort", () => {
    test("defaults to title asc, all pages", async () => {
        const rows = await (await seeded()).getPagesMetadata();
        expect(titles(rows)).toEqual(["About us", "Blog", "Contact"]);
    });

    test("search matches title OR path, case-insensitive", async () => {
        const repo = await seeded();
        expect(titles(await repo.getPagesMetadata({ search: "BLO" }))).toEqual(["Blog"]); // title
        expect(titles(await repo.getPagesMetadata({ search: "/cont" }))).toEqual(["Contact"]); // path
    });

    test("filters by tag", async () => {
        const rows = await (await seeded()).getPagesMetadata({ tag: "company" });
        expect(titles(rows)).toEqual(["About us", "Contact"]);
    });

    test("filters by visibility", async () => {
        const repo = await seeded();
        expect(titles(await repo.getPagesMetadata({ visible: "draft" }))).toEqual(["Blog"]);
        expect(titles(await repo.getPagesMetadata({ visible: "published" }))).toEqual(["About us", "Contact"]);
    });

    test("sorts by path desc", async () => {
        const rows = await (await seeded()).getPagesMetadata({ sortBy: "path", sortOrder: "desc" });
        expect(rows.map((r) => r.path)).toEqual(["/contact", "/blog", "/about"]);
    });

    test("published helper accepts only strict visible true", () => {
        expect(isPublishedPage({ visible: true } as any)).toBe(true);
        expect(isPublishedPage({ visible: "true" } as any)).toBe(false);
        expect(isPublishedPage({ visible: "false" } as any)).toBe(false);
        expect(isPublishedPage({ visible: false } as any)).toBe(false);
    });

    test("value counts use value asc as a stable tie-break", () => {
        expect(countValues(["beta", "alpha"])).toEqual([
            { value: "alpha", count: 1 },
            { value: "beta", count: 1 },
        ]);
    });

    test("rejects duplicate paths without replacing either page", async () => {
        const repo = new InMemoryCmsRepository();
        await repo.insertPage("/about", "About");
        await expect(repo.insertPage("/about", "Replacement")).rejects.toBeInstanceOf(DuplicatePagePathError);
        await repo.insertPage("/contact", "Contact");
        const contact = await repo.getPage("/contact");

        await expect(repo.updatePage({ id: contact!.id, path: "/about" })).rejects.toBeInstanceOf(
            DuplicatePagePathError,
        );
        expect((await repo.getPage("/about"))?.title).toBe("About");
        expect((await repo.getPage("/contact"))?.title).toBe("Contact");
    });
});
