import { describe, expect, test } from "bun:test";
import getBlocCatalogue from "cms-control/api/_content/bloc/catalogue.get";
import { eligibleStructureTags } from "cms-control/components/editorSystemV2/siteBloc/siteBlocCatalog";
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
        ownership: {
            kind: "integration",
            integrationKind: "commerce",
            installationId: "installation-1",
            definitionVersion: "1.2.0",
        },
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
    await repository.createTemplate({
        identifier: "catalogue-page",
        name: "Catalogue page",
        description: "",
        content: "<catalogue-grid></catalogue-grid>",
        category: "Commerce",
        createdAt: new Date("2026-07-27T10:00:00.000Z"),
    });
    return fixture;
}

describe("site bloc catalogue", () => {
    test("projects origins, direct/transitive dependencies and every usage kind", async () => {
        const { cms } = await catalogueFixture();
        const items = await siteBlocCatalogue(cms);
        const basic = items.find((item) => item.tag === "basic-card")!;
        const integration = items.find((item) => item.tag === "catalogue-grid")!;
        const site = items.find((item) => item.tag === "site-showcase")!;

        expect(basic.origin).toEqual({
            kind: "code-managed",
            label: "Code managed",
            detail: "Managed through code or the CLI",
        });
        expect(basic.usages.pages).toEqual([{ id: expect.any(String), label: "Home", path: "/home" }]);
        expect(basic.usages.blocs).toEqual([{ tag: "catalogue-grid", label: "Catalogue grid" }]);
        expect(basic.usageCount).toBe(2);

        expect(integration.origin).toMatchObject({
            kind: "integration",
            label: "Integration",
            detail: "commerce · 1.2.0",
        });
        expect(integration.directDependencies).toEqual(["basic-card"]);
        expect(integration.transitiveDependencies).toEqual(["basic-card"]);
        expect(integration.publishedTransitiveDependencies).toEqual(["basic-card"]);
        expect(integration.usages.templates).toEqual([
            { id: expect.any(String), label: "Catalogue page", tag: "catalogue-page" },
        ]);
        expect(integration.usages.blocs).toEqual([{ tag: "site-showcase", label: "Editorial showcase" }]);

        expect(site.origin).toMatchObject({ kind: "site-builder", label: "Site builder" });
        expect(site.directDependencies).toEqual(["catalogue-grid"]);
        expect(site.transitiveDependencies).toEqual(["basic-card", "catalogue-grid"]);
        expect(site.publishedTransitiveDependencies).toEqual(["basic-card", "catalogue-grid"]);
        expect(site).toMatchObject({ state: "published", editable: true, hasUnpublishedChanges: false });
    });

    test("combines origin, group and search filters and exposes the groups view", async () => {
        const { cms } = await catalogueFixture();
        expect(
            (await siteBlocCatalogue(cms, { origin: "integration", group: "Commerce", search: "grid" })).map(
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

    test("keeps picker cycle eligibility anchored to published dependencies while a draft diverges", async () => {
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
        expect(eligibleStructureTags(removingItems, ownerTag)).not.toContain("site-published-dependent");

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
        expect(eligibleStructureTags(addingItems, ownerTag)).toContain("site-draft-dependent");
    });

    test("does not expose the legacy claim marker as a public catalogue provenance", async () => {
        const { cms, repository } = siteBlocHarness();
        repository.seedLegacyClaimable("legacy-card");

        const [item] = await siteBlocCatalogue(cms);

        expect(item).toBeDefined();
        if (!item) {
            throw new Error("Expected the seeded legacy catalogue item");
        }
        expect(item.origin).toEqual({
            kind: "code-managed",
            label: "Code managed",
            detail: "Managed through code or the CLI",
        });
        expect(item).not.toHaveProperty("legacyOwnershipClaim");
    });
});
