import { expect, test } from "bun:test";
import { createCmsPage } from "@bernouy/cms-content";
import { collectionExampleDocument } from "@bernouy/cms-repository/collections";
import { officialPagesFixture } from "./officialPagesFixture";

test("official initial Pages and a translated input example use ordinary Content writes", async () => {
    const { repo, store, profile, seed, records } = await officialPagesFixture("ulvia");
    await seed();
    for (const seed of profile.initialPages) {
        const page = (await repo.getPage(seed.path))!;
        expect(page.visible).toBe(true);
        expect(page.indexing).toEqual({ enabled: false });
        expect(Object.hasOwn(page, "origin")).toBe(false);
    }
    expect(records.size).toBe(profile.initialPages.length);
    const artifact = (await store.snapshot("default")).collections[0]!;
    const input = collectionExampleDocument(artifact.release, "control-group-default");
    const created = await createCmsPage(repo, { path: "/example-input", title: "Input example", content: input.html });
    expect(created.content).toContain('placeholder="{{ cms.i18n.ulvia/mossa.ui-search }}"');
    expect(await repo.getAllPages()).toHaveLength(profile.initialPages.length + 1);
}, 30_000);

test("Repository installs its dependency graph and validates all ordinary application Pages without overwriting edits", async () => {
    const { repo, store, profile, seed, records } = await officialPagesFixture("repository");
    await seed();
    const installed = await store.snapshot("default");
    expect(installed.collections.map(({ collectionId }) => collectionId).toSorted()).toEqual([
        "ulvia/mossa",
        "ulvia/repository",
    ]);
    expect(installed.revision).toBe(1);
    expect(records.size).toBe(profile.initialPages.length);
    for (const seed of profile.initialPages) {
        const page = (await repo.getPage(seed.path))!;
        expect(page.visible).toBe(true);
        expect(page.indexing).toEqual({ enabled: seed.indexing });
    }
    const catalogue = (await repo.getPage("/"))!;
    expect(catalogue.content).toContain('cms-query="ulvia/repository:catalogue-list as catalogue"');
    const tokens = (await repo.getPage("/account/tokens"))!;
    expect(tokens.content).toContain("ulvia/cms.access:create-personal-access-token");
    const login = (await repo.getPage("/login"))!;
    expect(login.content).toContain('cms-mutation-redirect="/account"');
    expect(login.content).toContain('cms-mutation-redirect-param="returnTo"');
    expect((await repo.getSystem()).site.login).toEqual({ pageId: login.id });
    await repo.updatePage({ id: catalogue.id, title: "My catalogue", visible: false }, catalogue.revision);
    await seed();
    expect(await repo.getAllPages()).toHaveLength(profile.initialPages.length);
    expect(await repo.getPageById(catalogue.id)).toMatchObject({ title: "My catalogue", visible: false });
    expect((await store.snapshot("default")).revision).toBe(installed.revision);
}, 30_000);
