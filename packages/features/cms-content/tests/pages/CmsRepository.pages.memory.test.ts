import { describe, test, expect } from "bun:test";
import {
    countValues,
    createContentReader,
    DuplicatePagePathError,
    InMemoryCmsRepository,
    isPublishedPage,
} from "@bernouy/cms-content";

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
    test("public reader excludes drafts by path, id, and enumeration", async () => {
        const repository = await seeded();
        const reader = createContentReader(repository);
        const draft = (await repository.getPage("/blog"))!;

        expect(await reader.getPublishedPage("/blog")).toBeNull();
        expect(await reader.getPublishedPageById(draft.id)).toBeNull();
        expect((await reader.getPublishedPages()).map((page) => page.path)).toEqual(["/about", "/contact"]);
        expect(reader).not.toHaveProperty("getPage");
        expect(reader).not.toHaveProperty("getPageById");
        expect(reader).not.toHaveProperty("getAllPages");
    });

    test("public reader returns cloned published pages", async () => {
        const repository = await seeded();
        const reader = createContentReader(repository);
        const page = (await reader.getPublishedPage("/about"))!;
        page.tags.push("mutated");

        expect((await reader.getPublishedPage("/about"))?.tags).toEqual(["company"]);
    });

    test("public reader excludes fields outside the rendering projection", async () => {
        const page = {
            id: "page",
            path: "/page",
            title: "Page",
            description: "Description",
            content: "<main></main>",
            tags: [],
            visible: true,
            editorOnly: { draft: true },
        };
        const reader = createContentReader({
            getPublishedPage: async () => page,
        } as never);

        const projected = await reader.getPublishedPage("/page");
        expect(projected).not.toHaveProperty("editorOnly");
        expect(projected).toMatchObject({ visible: true, path: "/page" });
    });

    test("public reader projects mutable rendering settings without email or initialization state", async () => {
        const repository = new InMemoryCmsRepository();
        const reader = createContentReader(repository);
        const settings = await reader.getRenderingSettings();
        settings.site.host = "https://mutated.test";

        expect(settings).not.toHaveProperty("email");
        expect(settings).not.toHaveProperty("initializationStep");
        expect(settings).not.toHaveProperty("pageRoutesUpdating");
        expect(settings.site).not.toHaveProperty("additionalLanguages");
        expect((await reader.getRenderingSettings()).site.host).not.toBe("https://mutated.test");
    });

    test("public reader retains inactive rendering artifacts without authoring fields", async () => {
        let includeInactive = false;
        const reader = createContentReader({
            getBlocsList: async (options) => {
                includeInactive = options?.includeInactive === true;
                return [
                    {
                        id: "archived-layout",
                        name: "Archived layout",
                        group: "",
                        description: "",
                        compositionHTML: "<main><slot></slot></main>",
                        nativeElement: "main",
                        ownership: { kind: "code-managed" as const },
                    },
                ];
            },
        } as never);

        expect(await reader.getRenderableBlocs()).toEqual([
            {
                id: "archived-layout",
                compositionHTML: "<main><slot></slot></main>",
                nativeElement: "main",
            },
        ]);
        expect(includeInactive).toBe(true);
    });

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

    test("can create a page with initial editorial content", async () => {
        const repo = new InMemoryCmsRepository();
        await repo.insertPage("/copy", "Copy", "<main>Copied content</main>");

        expect((await repo.getPage("/copy"))?.content).toBe("<main>Copied content</main>");
    });

    test("value counts use value asc as a stable tie-break", () => {
        expect(countValues(["beta", "alpha"])).toEqual([
            { value: "alpha", count: 1 },
            { value: "beta", count: 1 },
        ]);
    });

    test("rejects duplicate paths without replacing either page", async () => {
        const repo = new InMemoryCmsRepository();
        await repo.updateSystem({ site: { language: "fr" } as never });
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
