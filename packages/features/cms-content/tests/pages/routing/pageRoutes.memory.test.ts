import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    createPageRouteReader,
    resolvePageLinkTarget,
    createContentReader,
} from "@bernouy/cms-content";

test("Page links resolve using Content's native routes and stable site IDs", async () => {
    const repo = new InMemoryContentRepository();
    await repo.insertPage("/about", "About");
    const page = (await repo.getPage("/about"))!;
    const reader = createPageRouteReader(repo);
    expect(
        await resolvePageLinkTarget(reader, { kind: "page", page: { kind: "site", pageId: page.id } }),
    ).toMatchObject({ href: "/about" });
    await repo.updatePage({ id: page.id, path: "/company" }, page.revision);
    expect(await reader.resolvePath("/about")).toEqual({ path: "/company" });
    expect(await reader.get({ kind: "site", pageId: page.id })).toEqual({ path: "/company" });
    await expect(
        reader.get({ kind: "contribution", sourceId: "old", contributionId: "old", pageId: page.id } as never),
    ).rejects.toThrow();
});

test("Page references require a string site ID and reject extra coordinates", async () => {
    const reader = createPageRouteReader(new InMemoryContentRepository());
    for (const pageId of [undefined, null, 123, {}, ""]) {
        await expect(reader.get({ kind: "site", pageId } as never)).rejects.toThrow("valid site-owned");
    }
    await expect(reader.get({ kind: "site", pageId: "id", sourceId: "old" } as never)).rejects.toThrow(
        "valid site-owned",
    );
});

test("Content link batches preserve localized paths and aliases, and exclude unavailable routes", async () => {
    const repo = new InMemoryContentRepository();
    await repo.updateSystem({
        site: { language: "en", additionalLanguages: ["fr"], activeLanguages: ["fr"] },
    } as never);
    await repo.insertPage("/about", "About");
    let page = (await repo.getPage("/about"))!;
    await repo.setPagePaths(page.id, { en: "/about", fr: "/a-propos" }, undefined, undefined, page.revision);
    page = (await repo.getPageById(page.id))!;
    await repo.updatePage({ id: page.id, visible: true }, page.revision);
    const reader = createContentReader(repo);
    expect(await reader.resolvePagePaths(["/about", "/fr/a-propos"])).toEqual({
        "/about": "/about",
        "/fr/a-propos": "/fr/a-propos",
    });
    page = (await repo.getPageById(page.id))!;
    await repo.setPagePaths(page.id, { en: "/about", fr: "/nous" }, undefined, undefined, page.revision);
    expect(await reader.resolvePagePaths(["/fr/a-propos"])).toEqual({ "/fr/a-propos": "/fr/nous" });
    expect(await createPageRouteReader(repo).resolvePath("/fr/a-propos")).toEqual({ path: "/fr/nous" });
    await repo.updateSystem({ site: { activeLanguages: [] } } as never, await repo.getSystemRevision());
    expect(await reader.resolvePagePaths(["/fr/nous"])).toEqual({});
    page = (await repo.getPageById(page.id))!;
    await repo.updatePage({ id: page.id, visible: false }, page.revision);
    expect(await reader.resolvePagePaths(["/about"])).toEqual({});
});

test("ordinary Page writes and localized routes reject reserved CMS paths", async () => {
    const repo = new ValidatingContentRepository(new InMemoryContentRepository());
    for (const path of ["/api", "/api/private", "/assets/page", "/auth/login", "/.cms/custom"]) {
        await expect(repo.insertPage(path, "Reserved")).rejects.toThrow();
    }
    expect(await repo.getAllPages()).toEqual([]);
    await repo.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } } as never);
    await repo.insertPage("/about", "About");
    const page = (await repo.getPage("/about"))!;
    await expect(repo.updatePage({ id: page.id, path: "/api/hidden" }, page.revision)).rejects.toThrow();
    await expect(
        repo.setPagePaths(page.id, { en: "/api/hidden" }, undefined, undefined, page.revision),
    ).rejects.toThrow("reserved");
    expect((await repo.getPageById(page.id))?.path).toBe("/about");
});
