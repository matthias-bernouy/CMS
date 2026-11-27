import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import { createContentReader, renderPageDocument } from "@bernouy/content/rendering";
import { InMemoryReleaseCatalogue } from "repository/exports/contracts/catalogue";
import { prepareRemoteCollection } from "repository/repository/authoring/preparations/prepare";
import { readPreparation } from "repository/repository/authoring/preparations/record";
import { FilesystemRepositoryPublicationRegistry } from "repository/repository/filesystem/mutations/publicationRegistry";
import { admitCollectionRelease } from "repository/collections/core/admission/admitCollectionRelease";
import { CollectionStore } from "repository/collections/installations/core/CollectionStore";
import { MemoryCollectionStorage } from "repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
import { withInstalledCollections } from "repository/collections/integration/content/installedRepository";
import { renderCollectionExamples } from "repository/collections/tooling/examples/render";
import { heroId, heroPage, videoFile, videoSource } from "./videoFixture";

test("native video prepares, renders, publishes, installs and retains editable site file references", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-native-video-"));
    try {
        const preparations = join(root, "preparations");
        const prepared = await prepareRemoteCollection(
            {
                root: preparations,
                contracts: new InMemoryReleaseCatalogue(),
                readAsset: async () => {
                    throw new Error("Site media must not be packaged");
                },
            },
            videoSource(),
            async () => ({ state: "complete", repositoryId: "repository", origin: "https://repository.test" }),
        );
        const { prepared: record } = await readPreparation(preparations, prepared.preparationId, prepared.digest);
        expect(
            await new FilesystemRepositoryPublicationRegistry(join(root, "registry")).publish({
                kind: "collection",
                canonicalJson: record.canonicalJson,
                sourceJson: record.sourceJson,
                assets: [],
            }),
        ).toMatchObject({ added: true, digest: prepared.digest });
        const artifact = await admitCollectionRelease(JSON.parse(record.canonicalJson));
        expect(artifact.release.assets).toHaveLength(0);
        const examples = await renderCollectionExamples(artifact);
        expect(examples.frames).toHaveLength(2);
        expect(await examples.files.get("hero--desktop.html")!.text()).toContain("<video");
        const store = new CollectionStore(new MemoryCollectionStorage());
        await store.importAdmittedRelease(artifact);
        await store.install("site", artifact.digest, 0);
        const installation = await store.snapshot("site");
        const local = new InMemoryContentRepository();
        const repository = new ValidatingContentRepository(withInstalledCollections(local, store, "site"));
        await repository.insertPage("/film", "Film", heroPage("film", "cover"));
        const page = (await repository.getPage("/film"))!;
        await repository.updatePage({ id: page.id, visible: true }, page.revision);
        const reopened = new ValidatingContentRepository(withInstalledCollections(local, store, "site"));
        const read = (await reopened.getPage("/film"))!;
        expect(read.content).toContain(videoFile("film"));
        expect(read.content).toContain(videoFile("cover"));
        await reopened.updatePage({ id: read.id, content: heroPage("replacement", "new-cover") }, read.revision);
        const replaced = (await reopened.getPage("/film"))!;
        const { document } = parseHTML("<html><body></body></html>");
        await renderPageDocument(
            document.body,
            { html: replaced.content },
            { repository: createContentReader(reopened), language: "en" },
        );
        expect(document.querySelector("video")!.getAttribute("src")).toBe(videoFile("replacement"));
        expect(document.querySelector("video")!.getAttribute("poster")).toBe(videoFile("new-cover"));
        expect(document.querySelector("h1")!.textContent).toBe("Our film");
        expect(await store.snapshot("site")).toEqual(installation);
        await expect(
            reopened.updatePage(
                { id: replaced.id, content: replaced.content.replace(videoFile("replacement"), "javascript:alert(1)") },
                replaced.revision,
            ),
        ).rejects.toThrow();
        expect(await reopened.getPage("/film")).toEqual(replaced);
        const foreign = new ValidatingContentRepository(
            withInstalledCollections(new InMemoryContentRepository(), store, "foreign"),
        );
        await expect(foreign.insertPage("/film", "Film", heroPage("film", "cover"))).rejects.toThrow(heroId);
        expect(await foreign.getPage("/film")).toBeNull();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
