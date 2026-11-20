import { expect, test } from "bun:test";
import { join } from "node:path";
import { InMemoryReleaseCatalogue } from "repository/exports/contracts/catalogue";
import { compileCollectionSources } from "repository/exports/repository/authoring/build";
import { prepareRemoteCollection } from "repository/repository/authoring/preparations/prepare";
import { readPreparation } from "repository/repository/authoring/preparations/record";
import { FilesystemRepositoryPublicationRegistry } from "repository/repository/filesystem/mutations/publicationRegistry";
import { LocalCollectionRepository } from "repository/repository/filesystem/artifacts/collections";
import { FilesystemRepositorySourceStore } from "repository/repository/sources/filesystem";
import { sourceFixture } from "../../../../../../../../tests/fixtures/repository/sourceBuild";

function withAnimatedBloc(sourceJson: string, declaration = "animation: fade 1s") {
    const source = JSON.parse(sourceJson);
    source.files.push(
        {
            path: "blocs/publisher--kit--panel/definition.json",
            content: JSON.stringify({
                kind: "component",
                id: "publisher--kit--panel",
                label: "collection.name",
                description: "collection.description",
                categories: ["collection.name"],
                catalogue: "hidden",
                root: { accepts: ["div"] },
            }),
        },
        { path: "blocs/publisher--kit--panel/markup.html", content: "<div></div>" },
        {
            path: "blocs/publisher--kit--panel/style.css",
            content: `@keyframes fade { to { opacity: 1; } } :scope { ${declaration}; }`,
        },
    );
    return JSON.stringify(source);
}

test("preparation, standalone build, publication and release reread agree on animation bytes and digest", async () => {
    const f = await sourceFixture();
    const root = join(f.root, "registry");
    const registry = new FilesystemRepositoryPublicationRegistry(root);
    try {
        const sourceJson = withAnimatedBloc(f.captured.sourceJson);
        const built = await compileCollectionSources(join(f.root, "local"), sourceJson, f.captured.assets);
        const preparations = join(f.root, "preparations");
        const preview = await prepareRemoteCollection(
            {
                root: preparations,
                contracts: new InMemoryReleaseCatalogue(),
                readAsset: async () => f.captured.assets[0]!.bytes,
            },
            sourceJson,
            async () => ({ state: "complete", repositoryId: "repository", origin: "https://repository.test" }),
        );
        const { prepared } = await readPreparation(preparations, preview.preparationId, preview.digest);
        expect(prepared.canonicalJson).toBe(built.admission.canonicalJson);
        expect(preview.digest).toBe(built.admission.digest);
        const envelope = {
            kind: "collection" as const,
            canonicalJson: prepared.canonicalJson,
            sourceJson: prepared.sourceJson,
            assets: built.admission.assets,
        };
        expect(await registry.publish(envelope)).toMatchObject({ added: true, digest: preview.digest });
        expect(await registry.publish(envelope)).toMatchObject({ added: false, digest: preview.digest });
        const read = await new LocalCollectionRepository(root).getMetadata("publisher", "publisher/kit", "1.0.0");
        expect(read!.canonicalJson).toBe(prepared.canonicalJson);
        expect(read!.digest).toBe(preview.digest);
    } finally {
        await f.close();
    }
});

test.each(["animation-name: foreign", "animation-name: var(--name)"])(
    "Repository rebuild rejects invalid animation sources before publication: %s",
    async (declaration) => {
        const f = await sourceFixture();
        const root = join(f.root, "registry");
        const registry = new FilesystemRepositoryPublicationRegistry(root);
        try {
            const built = await compileCollectionSources(
                join(f.root, "local"),
                withAnimatedBloc(f.sourceJson),
                f.captured.assets,
            );
            await expect(
                registry.publish({
                    kind: "collection",
                    canonicalJson: built.admission.canonicalJson,
                    sourceJson: withAnimatedBloc(f.sourceJson, declaration),
                    assets: built.admission.assets,
                }),
            ).rejects.toMatchObject({ code: "REJECTED" });
            expect(await new LocalCollectionRepository(root).listMetadata()).toHaveLength(0);
            expect(
                await new FilesystemRepositorySourceStore(root).get("publisher", "publisher/kit", "1.0.0"),
            ).toBeNull();
        } finally {
            await f.close();
        }
    },
);
