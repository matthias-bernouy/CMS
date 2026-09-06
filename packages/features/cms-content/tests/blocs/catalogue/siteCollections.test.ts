import { describe, expect, test } from "bun:test";
import { ContentValidationError, InMemoryCmsRepository, ValidatingCmsRepository } from "@bernouy/cms-content";
import { siteBlocArtifact, siteBlocDefinition, siteBlocSnapshot } from "../siteBlocFixture";

describe("site collection persistence", () => {
    test("keeps empty collections and isolates returned values", async () => {
        const repository = new ValidatingCmsRepository(new InMemoryCmsRepository());
        expect(await repository.getSiteBlocCollections()).toEqual([
            { id: "site", name: "Site", description: "Compositions created for this site." },
        ]);
        const [first, second] = await Promise.all([
            repository.createSiteBlocCollection({ name: " Landing pages ", description: " Shared sections " }),
            repository.createSiteBlocCollection({ name: "Campaigns", description: "" }),
        ]);
        expect(first.id).not.toBe(second.id);
        expect(first).toMatchObject({ name: "Landing pages", description: "Shared sections" });
        first.name = "Mutated";
        const collections = await repository.getSiteBlocCollections();
        expect(collections.map(({ name }) => name)).toEqual(["Site", "Campaigns", "Landing pages"]);
        collections[0]!.name = "Changed default";
        expect((await repository.getSiteBlocCollections())[0]!.name).toBe("Site");
    });

    test("validates metadata and rejects unknown explicit membership", async () => {
        const repository = new ValidatingCmsRepository(new InMemoryCmsRepository());
        for (const name of [" ", "x".repeat(121)]) {
            await expect(repository.createSiteBlocCollection({ name, description: "" })).rejects.toBeInstanceOf(
                ContentValidationError,
            );
        }
        await expect(repository.createSiteBloc(siteBlocDefinition({ collectionId: "unknown" }))).rejects.toBeInstanceOf(
            ContentValidationError,
        );
        await expect(repository.createSiteBloc(siteBlocDefinition({ collectionId: " " }))).rejects.toBeInstanceOf(
            ContentValidationError,
        );
        expect(await repository.getBlocRecords()).toEqual([]);
    });

    test("preserves membership across draft, publication and lifecycle changes", async () => {
        const repository = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const collection = await repository.createSiteBlocCollection({ name: "Sections", description: "" });
        const definition = siteBlocDefinition({ collectionId: collection.id });
        await repository.createSiteBloc(definition);
        await repository.saveSiteBlocDraft(definition.tag, siteBlocSnapshot({ name: "Updated" }), 1);
        await repository.publishSiteBloc(definition.tag, siteBlocArtifact(), 2);
        await repository.archiveSiteBloc(definition.tag, 2);
        await repository.restoreSiteBloc(definition.tag, 2);
        expect((await repository.getBlocRecord(definition.tag))?.siteDefinition).toMatchObject({
            collectionId: collection.id,
            draftRevision: 2,
            publishedRevision: 2,
            lifecycle: "active",
        });
    });
});
