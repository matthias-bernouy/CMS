import { expect, test } from "bun:test";
import { initialPagesFixture as fixture } from "./initialPagesFixture";
import { resolvePageMetadata, storedSitemapLocations } from "@bernouy/cms-content/seo";
import { createContentReader } from "@bernouy/cms-content";

test("initial Pages are ordinary site Pages, seeded once and independent of the profile afterwards", async () => {
    const { repo, seed, records } = fixture();
    await seed();
    const page = (await repo.getPage("/login"))!;
    expect(page).toMatchObject({ title: "Login", description: "Sign in", visible: true, indexing: { enabled: false } });
    expect(Object.hasOwn(page, "origin")).toBe(false);
    expect(records.get("test:login")).toEqual({ _id: "test:login", completed: true });
    expect((await repo.getSystem()).site.login).toEqual({ kind: "site", pageId: page.id });
    await repo.updatePage({ id: page.id, path: "/my-login", title: "My login", visible: false }, page.revision);
    await seed();
    expect(await repo.getAllPages()).toHaveLength(1);
    expect(await repo.getPageById(page.id)).toMatchObject({ path: "/my-login", title: "My login", visible: false });
});

test("provisioning resumes after a receipt failure without duplicate Pages", async () => {
    const { repo, seed, interrupt } = fixture();
    interrupt();
    await expect(seed()).rejects.toThrow("Interrupted receipt write");
    const first = (await repo.getAllPages())[0]!;
    await seed();
    expect(await repo.getAllPages()).toHaveLength(1);
    expect((await repo.getAllPages())[0]?.id).toBe(first.id);
});

test("provisioning refuses to take over a pre-existing Page or continue with a lost lease", async () => {
    const { repo, seed, execution, records } = fixture();
    await repo.insertPage("/login", "Existing");
    await expect(seed()).rejects.toThrow("already owns");
    expect((await repo.getPage("/login"))?.visible).toBe(false);
    expect(records.size).toBe(0);
    execution.throwIfLeaseLost = () => {
        throw new Error("Lease lost");
    };
    await expect(seed()).rejects.toThrow("Lease lost");
});

test("provisioning preserves an explicitly selected site login Page", async () => {
    const { repo, seed } = fixture();
    const login = { kind: "site" as const, pageId: "custom-login" };
    await repo.updateSystem({ site: { login } } as never, await repo.getSystemRevision());
    await seed();
    expect((await repo.getSystem()).site.login).toEqual(login);
});

test("incomplete receipts replay document and metadata initialization after a failure", async () => {
    const { repo, seed, records } = fixture();
    const update = repo.updatePage.bind(repo);
    let interrupted = false;
    repo.updatePage = async (...args) => {
        if (!interrupted && args[0].description !== undefined) {
            interrupted = true;
            throw new Error("Interrupted metadata write");
        }
        return update(...args);
    };
    await expect(seed()).rejects.toThrow("Interrupted metadata write");
    const draft = (await repo.getPage("/login"))!;
    expect(draft.visible).toBe(false);
    await seed();
    expect(await repo.getPageById(draft.id)).toMatchObject({
        description: "Sign in",
        visible: true,
        indexing: { enabled: false },
    });
    expect(records.get("test:login")).toEqual({ _id: "test:login", completed: true });
    expect(await repo.getAllPages()).toHaveLength(1);
});

test("technical Pages explicitly render noindex metadata", async () => {
    const { repo, seed } = fixture();
    await seed();
    const reader = createContentReader(repo);
    const page = (await repo.getPage("/login"))!;
    expect(resolvePageMetadata(page, await reader.getRenderingSettings()).robots).toBe("noindex,follow");
});

test("technical Pages stay outside the sitemap while ordinary Pages remain indexable", async () => {
    const { repo, seed } = fixture();
    await seed();
    await repo.insertPage("/article", "Article");
    const article = (await repo.getPage("/article"))!;
    await repo.updatePage({ id: article.id, visible: true }, article.revision);
    const reader = createContentReader(repo);
    expect(await storedSitemapLocations(await reader.getPublishedPages(), [], reader.resolvePublishedRoute)).toEqual([
        { location: "/article" },
    ]);
});

test("provisioning recovers a draft inserted before its receipt acknowledgement", async () => {
    const { repo, seed, receipts } = fixture();
    const update = receipts.updateOne;
    let interrupted = false;
    receipts.updateOne = async (...args) => {
        if (!interrupted && args[1].$set.pageId) {
            interrupted = true;
            throw new Error("Interrupted draft acknowledgement");
        }
        return update(...args);
    };
    await expect(seed()).rejects.toThrow("Interrupted draft acknowledgement");
    const draft = (await repo.getPage("/login"))!;
    await seed();
    expect(await repo.getAllPages()).toHaveLength(1);
    expect(await repo.getPageById(draft.id)).toMatchObject({
        description: "Sign in",
        visible: true,
        indexing: { enabled: false },
    });
});
