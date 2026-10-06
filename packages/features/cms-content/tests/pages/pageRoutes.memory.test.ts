import { expect, test } from "bun:test";
import {
    ContentValidationError,
    DuplicatePagePathError,
    InMemoryCmsRepository,
    type TSystem,
} from "@bernouy/cms-content";

test("default paths stay at the site root and retired URLs stay reserved", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.insertPage("/about", "About");
    const original = (await repo.getPage("/about"))!;
    await repo.updatePage({ id: original.id, visible: true });
    await repo.updateSystem({
        site: { language: "fr", additionalLanguages: ["en"], activeLanguages: ["en"] } as never,
    });

    expect(await repo.getPageById(original.id)).toMatchObject({
        path: "/about",
        paths: { fr: "/about" },
    });
    expect(await repo.getPageRoute("/about")).toMatchObject({ state: "current", pageId: original.id });

    await repo.setPagePaths(original.id, { fr: "/a-propos", en: "/about" });
    expect(await repo.getPageRoute("/a-propos")).toMatchObject({ state: "current", language: "fr" });
    expect(await repo.getPageRoute("/en/about")).toMatchObject({ state: "current", language: "en" });
    expect(await repo.getPageRoute("/about")).toMatchObject({ state: "redirect", pageId: original.id });
    await expect(repo.insertPage("/about", "Reuse")).rejects.toBeInstanceOf(DuplicatePagePathError);

    await repo.deletePage(original.id);
    expect(await repo.getPageRoute("/about")).toMatchObject({ state: "gone" });
    expect(await repo.getPageRoute("/en/about")).toMatchObject({ state: "gone" });
    await repo.insertPage("/new", "New");
    const created = (await repo.getPage("/new"))!;
    await expect(repo.setPagePaths(created.id, { fr: "/new", en: "/about" })).rejects.toBeInstanceOf(
        DuplicatePagePathError,
    );
});

test("deletion alternative redirects every historical path to a stable page id", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.updateSystem({
        site: { language: "fr", additionalLanguages: ["en"], activeLanguages: ["en"] } as never,
    });
    await repo.insertPage("/first", "First");
    await repo.insertPage("/replacement", "Replacement");
    const first = (await repo.getPage("/first"))!;
    const replacement = (await repo.getPage("/replacement"))!;
    await repo.updatePage({ id: first.id, visible: true });
    await repo.updatePage({ id: replacement.id, visible: true });
    await repo.setPagePaths(first.id, { fr: "/first", en: "/first" });
    await repo.setPagePaths(replacement.id, { fr: "/replacement", en: "/replacement" });

    await repo.deletePageWithAlternative(first.id, replacement.id);
    expect(await repo.getPageRoute("/en/first")).toMatchObject({
        state: "redirect",
        pageId: replacement.id,
        language: "en",
    });
    await repo.setPagePaths(replacement.id, { fr: "/nouveau", en: "/new" });
    expect((await repo.getPageById(replacement.id))?.paths?.en).toBe("/new");
    await expect(repo.setPagePaths(replacement.id, { fr: "/first", en: "/new" })).rejects.toBeInstanceOf(
        DuplicatePagePathError,
    );
});

test("changing the default language updates the primary path on the same page", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repo.insertPage("/about", "About");
    const page = (await repo.getPage("/about"))!;

    await repo.updateSystem({
        site: { language: "en", additionalLanguages: ["fr"], activeLanguages: ["fr"] } as never,
    });
    expect(await repo.getPageById(page.id)).toMatchObject({
        path: "/about",
        paths: { en: "/about", fr: "/about" },
    });
    expect(await repo.getPageRoute("/fr/about")).toMatchObject({ state: "current", pageId: page.id });
    expect(await repo.getPageRoute("/about")).toMatchObject({ state: "current", pageId: page.id, language: "en" });
});

test("in-memory settings saves wait for a language route change before merging", async () => {
    class PausedRepository extends InMemoryCmsRepository {
        pause: Promise<void> | null = null;
        entered: (() => void) | null = null;

        protected override async reconfigurePageRoutes(
            system: TSystem,
            previousDefaultLanguage?: string,
            dryRun = false,
        ): Promise<void> {
            if (dryRun && this.pause) {
                const pending = this.pause;
                this.pause = null;
                this.entered?.();
                await pending;
            }
            await super.reconfigurePageRoutes(system, previousDefaultLanguage, dryRun);
        }
    }
    const repo = new PausedRepository();
    await repo.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
        repo.entered = resolve;
    });
    repo.pause = held;
    const switchLanguage = repo.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    await entered;
    const saveFavicon = repo.updateSystem({ site: { favicon: "/new.ico" } as never });
    release();
    await Promise.all([switchLanguage, saveFavicon]);
    expect((await repo.getSystem()).site).toMatchObject({ language: "en", favicon: "/new.ico" });
});

test("a new page path is local even when it begins with the language prefix", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.updateSystem({ site: { language: "fr" } as never });
    await repo.insertPage("/fr/about", "About");
    expect((await repo.getPage("/fr/about"))?.paths).toEqual({ fr: "/fr/about" });
    expect(await repo.getPageRoute("/fr/fr/about")).toBeNull();
});

test("updating a default-language path keeps a literal language-looking segment", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.updateSystem({ site: { language: "en" } as never });
    await repo.insertPage("/before", "Before");
    const page = (await repo.getPage("/before"))!;

    await repo.updatePage({ id: page.id, path: "/en/about" });
    expect((await repo.getPageById(page.id))?.paths).toEqual({ en: "/en/about" });
    expect((await repo.getPageById(page.id))?.path).toBe("/en/about");
    expect(await repo.getPageRoute("/en/about")).toMatchObject({ state: "current", pageId: page.id });
    expect(await repo.getPageRoute("/about")).toBeNull();
});

test("the default French language makes URL edits available on a fresh repository", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.insertPage("/before", "Before");
    const page = (await repo.getPage("/before"))!;

    await repo.updatePage({ id: page.id, path: "/after" });
    expect(await repo.getPageById(page.id)).toMatchObject({ path: "/after", paths: { fr: "/after" } });
    expect(await repo.getPageRoute("/after")).toMatchObject({ state: "current", pageId: page.id });
});

test("a literal language-looking path survives a default language change in memory", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repo.insertPage("/en/about", "About");
    const page = (await repo.getPage("/en/about"))!;

    await repo.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    expect((await repo.getPageById(page.id))?.paths).toEqual({ en: "/en/about", fr: "/en/about" });
    expect((await repo.getPageById(page.id))?.path).toBe("/en/about");
});

test("the language matrix rejects duplicate language codes with different casing", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.updateSystem({ site: { language: "fr" } as never });
    await repo.insertPage("/about", "About");
    const page = (await repo.getPage("/about"))!;
    await expect(repo.setPagePaths(page.id, { fr: "/about", FR: "/autre" })).rejects.toBeInstanceOf(
        ContentValidationError,
    );
    expect((await repo.getPageById(page.id))?.paths).toEqual({ fr: "/about" });
});

test("root paths survive configuring the first site language", async () => {
    const repo = new InMemoryCmsRepository();
    await repo.insertPage("/about", "About");
    await repo.insertPage("/fr/about", "Already prefixed");
    const before = await repo.getAllPages();

    await repo.updateSystem({ site: { language: "fr" } as never });
    expect((await repo.getAllPages()).map((page) => page.path)).toEqual(before.map((page) => page.path));
    expect((await repo.getAllPages()).map((page) => page.paths)).toEqual([{ fr: "/about" }, { fr: "/fr/about" }]);
    expect((await repo.getSystem()).site.language).toBe("fr");
});

test("system settings reject a stale revision", async () => {
    const repo = new InMemoryCmsRepository();
    expect(await repo.getSystemRevision()).toBe(0);

    await repo.updateSystem({ site: { favicon: "/first.ico" } as never }, 0);
    expect(await repo.getSystemRevision()).toBe(1);
    await expect(repo.updateSystem({ site: { favicon: "/stale.ico" } as never }, 0)).rejects.toMatchObject({
        status: 409,
    });
    expect((await repo.getSystem()).site.favicon).toBe("/first.ico");
});
