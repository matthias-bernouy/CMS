import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import { withInstalledCollections } from "@bernouy/repository/collections/content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/repository/collections/installations";

test("the temporary collection view preserves ordinary stored Bloc requirements", async () => {
    const inner = new InMemoryContentRepository();
    const requirement = { contractId: "ulvia/cms.files", capabilityId: "files.list", versionRange: "^1.0.0" };
    await inner.createBloc({
        id: "local-card",
        kind: "component",
        name: "Local",
        group: "Local",
        description: "",
        root: { accepts: ["div"] },
        viewJS: "",
        markupHTML: "<slot></slot>",
        requires: [requirement],
    });
    const view = withInstalledCollections(inner, new CollectionStore(new MemoryCollectionStorage()), "site");
    expect(
        await view.getPageRequirements!({
            id: "page",
            revision: 1,
            path: "/page",
            title: "Page",
            description: "",
            tags: [],
            visible: true,
            content: '<div cms-bloc="local-card"></div>',
        }),
    ).toEqual([requirement]);
});
