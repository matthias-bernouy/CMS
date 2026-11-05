import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/cms-content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { prepareCollectionUpgrade } from "../../../../src/collections/installations/upgrades/planning/plan";
import { collectionDocument } from "../../fixtures";
import { collectionFixture } from "../../admission/examples/buildFixture";

test.each([
    ['<main><main><slot name="body"></slot></main></main>', "nested inside"],
    ['<section><a href="/missing">{{ copy }}</a><slot name="body"></slot></section>', "unavailable route"],
])(
    "upgrade planning refuses incompatible expanded template %s before changing installed or Page state",
    async (markup, message) => {
        const repository = new InMemoryContentRepository();
        const collections = new CollectionStore(new MemoryCollectionStorage());
        const source = collectionDocument() as any;
        source.blocs = [source.blocs[0]];
        const previous = await collections.importRelease(collectionFixture(source));
        await collections.install("site", previous.digest, 0);
        await repository.insertPage("/source", "Source", '<div cms-bloc="atlas-dofficial--atlas--panel"></div>');
        const page = (await repository.getPage("/source"))!;
        await repository.updatePage({ id: page.id, visible: true }, page.revision);
        const before = await repository.getPageById(page.id);
        const next = await collections.importRelease(
            collectionFixture({
                ...source,
                version: "2.0.0",
                blocs: [{ ...source.blocs[0], markup }],
            }),
        );
        const plan = await prepareCollectionUpgrade(repository, collections, "site", [{ digest: next.digest }], {
            contributors: [],
            requiredConsumers: [],
            validateCapabilities: async () => [],
        });
        expect(plan.status).toBe("blocked");
        expect(plan.issues).toContainEqual(
            expect.objectContaining({
                code: "incompatible-content",
                location: expect.stringContaining(page.id),
                message: expect.stringContaining(message),
            }),
        );
        expect(await collections.revision("site")).toBe(1);
        expect(await repository.getPageById(page.id)).toEqual(before);
    },
);
