import { describe, test, expect } from "bun:test";
import {
    countValues,
    createContentReader,
    DuplicatePagePathError,
    InMemoryContentRepository,
    isPublishedPage,
    PageRevisionConflictError,
} from "@bernouy/cms-content";

/** Seed three pages with distinct titles/paths/tags/visibility. */
async function seeded() {
    const repo = new InMemoryContentRepository();
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

describe("InMemoryContentRepository.getPagesMetadata — filter + sort", () => {
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
            revision: 1,
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
        const repository = new InMemoryContentRepository();
        const reader = createContentReader(repository);
        const settings = await reader.getRenderingSettings();
        settings.site.host = "https://mutated.test";

        expect(settings).not.toHaveProperty("email");
        expect(settings).not.toHaveProperty("initializationStep");
        expect(settings).not.toHaveProperty("pageRoutesUpdating");
        expect(settings.site).not.toHaveProperty("additionalLanguages");
        expect((await reader.getRenderingSettings()).site.host).not.toBe("https://mutated.test");
    });

    test("rendering revision includes both contributed content and system settings", async () => {
        let contentRevision = 3;
        let systemRevision = 5;
        const reader = createContentReader({
            getContentContributions: async () => ({ revision: contentRevision, pages: [], texts: [] }),
            getSystemRevision: async () => systemRevision,
        } as never);

        const initial = await reader.getRenderingRevision!();
        systemRevision += 1;
        expect(await reader.getRenderingRevision!()).not.toBe(initial);
        contentRevision += 1;
        expect(await reader.getRenderingRevision!()).not.toBe(initial);
    });

    test("Page render revisions change with the resolved Page revision", async () => {
        const repository = await seeded();
        const reader = createContentReader(repository);
        const initial = await reader.getPageRenderRevision!("/about");
        const page = (await repository.getPage("/about"))!;

        await repository.updatePage({ id: page.id, title: "Updated about" }, page.revision);

        expect(await reader.getPageRenderRevision!("/about")).not.toBe(initial);
    });

    test("public reader retains hidden rendering artifacts without authoring fields", async () => {
        let includeHidden = false;
        const reader = createContentReader({
            getBlocsList: async (options) => {
                includeHidden = options?.includeHidden === true;
                return [
                    {
                        id: "archived-layout",
                        name: "Archived layout",
                        group: "",
                        description: "",
                        kind: "composition" as const,
                        markupHTML: "<main><slot></slot></main>",
                        uses: ["shared-card"],
                        root: { accepts: ["a"] },
                        ownership: { kind: "code-managed" as const },
                    },
                ];
            },
        } as never);

        expect(await reader.getRenderableBlocs()).toEqual([
            {
                id: "archived-layout",
                kind: "composition" as const,
                markupHTML: "<main><slot></slot></main>",
                uses: ["shared-card"],
                root: { accepts: ["a"] },
            },
        ]);
        expect(includeHidden).toBe(true);
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
        expect(isPublishedPage({ visible: true })).toBe(true);
        expect(isPublishedPage({ visible: "true" } as any)).toBe(false);
        expect(isPublishedPage({ visible: "false" } as any)).toBe(false);
        expect(isPublishedPage({ visible: false })).toBe(false);
    });

    test("can create a page with initial editorial content", async () => {
        const repo = new InMemoryContentRepository();
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
        const repo = new InMemoryContentRepository();
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

    test("increments page revisions and rejects stale content and route writes", async () => {
        const repo = new InMemoryContentRepository();
        await repo.updateSystem({ site: { language: "en" } as never });
        await repo.insertPage("/before", "Before");
        const initial = (await repo.getPage("/before"))!;
        expect(initial.revision).toBe(1);
        const updated = await repo.updatePage({ id: initial.id, title: "After" }, initial.revision);
        expect(updated?.revision).toBe(2);
        await expect(repo.updatePage({ id: initial.id, title: "Stale" }, initial.revision)).rejects.toBeInstanceOf(
            PageRevisionConflictError,
        );
        const moved = await repo.setPagePaths(initial.id, { en: "/after" }, undefined, undefined, 2);
        expect(moved.revision).toBe(3);
        await expect(repo.setPagePaths(initial.id, { en: "/stale" }, undefined, undefined, 2)).rejects.toBeInstanceOf(
            PageRevisionConflictError,
        );
        await expect(repo.deletePage(initial.id, 2)).rejects.toBeInstanceOf(PageRevisionConflictError);
        expect(await repo.getPageById(initial.id)).not.toBeNull();
    });
});
