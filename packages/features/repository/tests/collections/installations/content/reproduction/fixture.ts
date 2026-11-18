import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    createCmsSiteBloc,
    publishCmsSiteBloc,
} from "@bernouy/content";
import { createContentReader, expandCompositions } from "@bernouy/content/rendering";
import { parseHTML } from "linkedom";
import { fileURLToPath } from "node:url";
import { CollectionStore } from "repository/collections/installations/core/CollectionStore";
import { MemoryCollectionStorage } from "repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
import { withInstalledCollections } from "repository/collections/integration/content/installedRepository";

const root = new URL("../../../../../fixtures/collections/reproduction/", import.meta.url);
export const artifact = await prepareCollectionRelease(fileURLToPath(new URL("studio/", root)));
export const pages: { path: string; title: string; content: string }[] = await Bun.file(
    new URL("site/pages.json", root),
).json();
const compositions: { tag: string; name: string; group: string; content: string }[] = await Bun.file(
    new URL("site/compositions.json", root),
).json();

export async function reproductionSite() {
    const storage = new MemoryCollectionStorage();
    const store = new CollectionStore(storage);
    await store.importAdmittedRelease(artifact);
    await store.install("site", artifact.digest, 0);
    const local = new InMemoryContentRepository();
    const repository = new ValidatingContentRepository(withInstalledCollections(local, store, "site"));
    for (const composition of compositions) {
        const created = await createCmsSiteBloc(repository, composition);
        await publishCmsSiteBloc(repository, { tag: created.tag, revision: created.draftRevision });
    }
    for (const page of pages) {
        await repository.insertPage(page.path, page.title, page.content);
    }
    const render = async (path: string) => {
        const page = (await repository.getPage(path))!;
        const { document } = parseHTML(`<html><body>${page.content}</body></html>`);
        expandCompositions(document.body, await createContentReader(repository).getRenderableBlocs());
        return document;
    };
    return { repository, local, store, storage, render };
}
