import { describe, expect, test } from "bun:test";
import getBlocCatalogue from "cms-control/api/_content/bloc/_catalogue/catalogue.get";
import { siteBlocCatalogue } from "cms-control/core/content/siteBloc/catalogue";
import { blocArtifact, seedBloc, seedPublishedSiteBloc, siteBlocHarness, siteSnapshot } from "./fixtures";

async function catalogueFixture() {
    const fixture = siteBlocHarness();
    const { repository } = fixture;
    await seedBloc(repository, "basic-card", { name: "Basic card", group: "Basic" });
    await seedBloc(repository, "catalogue-grid", {
        name: "Catalogue grid",
        group: "Commerce",
        viewJS: `const template = "<basic-card></basic-card>";`,
        ownership: { kind: "code-managed" },
    });
    await seedPublishedSiteBloc(
        repository,
        "site-showcase",
        siteSnapshot({
            name: "Editorial showcase",
            group: "Editorial",
            structure: [{ kind: "bloc", tag: "catalogue-grid", attributes: {}, children: [] }],
            dependencies: ["catalogue-grid"],
        }),
        { name: "Editorial showcase" },
    );

    await repository.insertPage("/home", "Home");
    const page = await repository.getPage("/home");
    await repository.updatePage({ ...page!, content: "<basic-card></basic-card>" });
    return fixture;
}

describe("site bloc catalogue", () => {
    test("keeps internal behavior controllers out of the author catalogue", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedBloc(repository, "site-shell", {
            compositionHTML: "<site-shell-controller></site-shell-controller>",
        });
        await seedBloc(repository, "site-shell-controller", { internal: true });

        const items = await siteBlocCatalogue(cms);

        expect(items.map((item) => item.tag)).toEqual(["site-shell"]);
        expect(items[0]?.directDependencies).toEqual(["site-shell-controller"]);
    });

    test("lists inactive collection resources for management while keeping them out of the public catalogue", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedBloc(repository, "selected", { catalogue: "active" });
        await seedBloc(repository, "not-selected", { catalogue: "inactive" });

        expect((await siteBlocCatalogue(cms)).map(({ tag, active }) => ({ tag, active }))).toEqual([
            { tag: "not-selected", active: false },
            { tag: "selected", active: true },
        ]);
        expect((await repository.getBlocsList()).map(({ id }) => id)).toEqual(["selected"]);
        expect(await repository.getBlocViewJS("not-selected")).toBeString();
    });

    test("projects origins, direct/transitive dependencies and usage", async () => {
        const { cms } = await catalogueFixture();
        const items = await siteBlocCatalogue(cms);
        const basic = items.find((item) => item.tag === "basic-card")!;
        const codeManaged = items.find((item) => item.tag === "catalogue-grid")!;
        const site = items.find((item) => item.tag === "site-showcase")!;

        expect(basic.origin).toEqual({
            kind: "code-managed",
            label: "Code managed",
            detail: "Managed through code or the CLI",
        });
        expect(basic.usages.pages).toEqual([{ id: expect.any(String), label: "Home", path: "/home" }]);
        expect(basic.usages.blocs).toEqual([{ tag: "catalogue-grid", label: "Catalogue grid" }]);
        expect(basic.usageCount).toBe(2);

        expect(codeManaged.origin).toMatchObject({ kind: "code-managed", label: "Code managed" });
        expect(codeManaged.directDependencies).toEqual(["basic-card"]);
        expect(codeManaged.transitiveDependencies).toEqual(["basic-card"]);
        expect(codeManaged.publishedTransitiveDependencies).toEqual(["basic-card"]);
        expect(codeManaged.usages.blocs).toEqual([{ tag: "site-showcase", label: "Editorial showcase" }]);

        expect(site.origin).toMatchObject({ kind: "site-builder", label: "Site builder" });
        expect(site.directDependencies).toEqual(["catalogue-grid"]);
        expect(site.transitiveDependencies).toEqual(["basic-card", "catalogue-grid"]);
        expect(site.publishedTransitiveDependencies).toEqual(["basic-card", "catalogue-grid"]);
        expect(site).toMatchObject({ state: "published", hasUnpublishedChanges: false });
        expect(site.origin).toMatchObject({ detail: "Managed in this site" });
    });

    test("combines origin, group and search filters and exposes the groups view", async () => {
        const { cms } = await catalogueFixture();
        expect(
            (await siteBlocCatalogue(cms, { origin: "code-managed", group: "Commerce", search: "grid" })).map(
                (item) => item.tag,
            ),
        ).toEqual(["catalogue-grid"]);
        expect(await siteBlocCatalogue(cms, { origin: "site-builder", search: "missing" })).toEqual([]);

        const response = await getBlocCatalogue(
            new Request("http://localhost/cms/api/bloc/catalogue?view=groups"),
            cms,
        );
        expect(await response.json()).toEqual([{ value: "Basic" }, { value: "Commerce" }, { value: "Editorial" }]);
    });

    test("uses draft metadata and reports unpublished changes without replacing the live artifact", async () => {
        const { cms, repository } = await catalogueFixture();
        const record = (await repository.getBlocRecord("site-showcase"))!;
        await repository.saveSiteBlocDraft(
            "site-showcase",
            { ...record.siteDefinition!.draft, name: "Renamed draft" },
            1,
        );

        const site = (await siteBlocCatalogue(cms)).find((item) => item.tag === "site-showcase")!;
        expect(site).toMatchObject({ name: "Renamed draft", state: "draft", hasUnpublishedChanges: true });
        expect((await repository.getBlocRecord("site-showcase"))?.artifact).toEqual(
            blocArtifact("site-showcase", {
                ownership: record.siteDefinition!.ownership,
                name: "Editorial showcase",
            }),
        );
    });

    test("tracks draft and published dependency closures independently", async () => {
        const ownerTag = "site-cycle-owner";

        const removingFixture = siteBlocHarness();
        await seedPublishedSiteBloc(removingFixture.repository, ownerTag);
        await seedPublishedSiteBloc(
            removingFixture.repository,
            "site-published-dependent",
            siteSnapshot({ dependencies: [ownerTag] }),
        );
        const removingRecord = (await removingFixture.repository.getBlocRecord("site-published-dependent"))!;
        await removingFixture.repository.saveSiteBlocDraft(
            "site-published-dependent",
            { ...removingRecord.siteDefinition!.draft, dependencies: [] },
            removingRecord.siteDefinition!.draftRevision,
        );

        const removingItems = await siteBlocCatalogue(removingFixture.cms);
        const removingCandidate = removingItems.find((item) => item.tag === "site-published-dependent")!;
        expect(removingCandidate.transitiveDependencies).toEqual([]);
        expect(removingCandidate.publishedTransitiveDependencies).toEqual([ownerTag]);

        const addingFixture = siteBlocHarness();
        await seedPublishedSiteBloc(addingFixture.repository, ownerTag);
        await seedPublishedSiteBloc(addingFixture.repository, "site-draft-dependent");
        const addingRecord = (await addingFixture.repository.getBlocRecord("site-draft-dependent"))!;
        await addingFixture.repository.saveSiteBlocDraft(
            "site-draft-dependent",
            { ...addingRecord.siteDefinition!.draft, dependencies: [ownerTag] },
            addingRecord.siteDefinition!.draftRevision,
        );

        const addingItems = await siteBlocCatalogue(addingFixture.cms);
        const addingCandidate = addingItems.find((item) => item.tag === "site-draft-dependent")!;
        expect(addingCandidate.transitiveDependencies).toEqual([ownerTag]);
        expect(addingCandidate.publishedTransitiveDependencies).toEqual([]);
    });
});
