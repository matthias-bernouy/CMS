import { collectionFixture } from "../../admission/examples/buildFixture";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import type { BlocListItemResponse } from "@bernouy/cms-content";
import { createContentReader } from "@bernouy/cms-content/rendering";
import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";

export class RenderingStorage extends MemoryCollectionStorage {
    siteReads = 0;
    override readSite(siteId: string) {
        this.siteReads++;
        return super.readSite(siteId);
    }
}

export async function renderingScopeFixture() {
    const storage = new RenderingStorage();
    const store = new CollectionStore(storage);
    const artifact = await store.importRelease(
        collectionFixture({
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "scoped",
            publisherId: "example",
            version: "1.0.0",
            name: "name",
            locale: "en",
            translations: { en: { name: "Scoped", label: "Card" } },
            assets: [],
            texts: [{ id: "title", label: "label", group: "label", category: "label", values: { en: "Initial" } }],
            blocs: [
                {
                    kind: "component",
                    id: "scoped-card",
                    root: { accepts: ["div"] },
                    label: "label",
                    description: "label",
                    categories: ["label"],
                    markup: "<article></article>",
                    uses: [],
                    requires: [],
                    slots: {},
                },
            ],
        }),
    );
    await store.install("site", artifact.digest, 0);
    const local = new InMemoryContentRepository();
    await local.insertPage("/", "Home", '<div cms-bloc="scoped-card"></div>');
    const page = (await local.getPage("/"))!;
    await local.updatePage({ id: page.id, visible: true }, page.revision);
    const counts = { blocs: 0, system: 0, routes: 0 };
    const getSystem = local.getSystem.bind(local);
    local.getSystem = async () => {
        counts.system++;
        return getSystem();
    };
    const getRoute = local.getPageRoute.bind(local);
    local.getPageRoute = async (path) => {
        counts.routes++;
        return getRoute(path);
    };
    let localBlocs: BlocListItemResponse[] = [];
    local.getBlocsList = async () => {
        counts.blocs++;
        return structuredClone(localBlocs);
    };
    const decorated = withInstalledCollections(local, store, "site");
    const repository = new ValidatingContentRepository(decorated);
    const reader = createContentReader(repository);
    await reader.getPageRenderInputs!("/");
    const reset = () => {
        storage.siteReads = 0;
        counts.blocs = 0;
        counts.system = 0;
        counts.routes = 0;
    };
    reset();
    return {
        storage,
        store,
        local,
        decorated,
        repository,
        reader,
        page,
        counts,
        reset,
        set localBlocs(value: BlocListItemResponse[]) {
            localBlocs = value;
        },
    };
}
