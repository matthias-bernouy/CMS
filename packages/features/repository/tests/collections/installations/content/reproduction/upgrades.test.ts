import { expect, test } from "bun:test";
import { createCmsSiteBloc, InMemoryContentRepository } from "@bernouy/content";
import { validateUpgradeContent } from "repository/collections/installations/upgrades/planning/content";
import { prepareCollectionUpgrade } from "repository/collections/installations/upgrades/planning/plan";
import { localBlocDocuments } from "repository/collections/installations/upgrades/usage/localDocuments";
import { readUsageSnapshot } from "repository/collections/installations/upgrades/usage/snapshot";
import { artifact, reproductionSite } from "./fixture";

test.each([false, true])("collection upgrades preserve local compositions (archived: %s)", async (archived) => {
    const { repository, local, store } = await reproductionSite();
    if (archived) {
        for (const record of await local.getBlocRecords()) {
            await local.archiveSiteBloc(record.tag, record.siteDefinition!.draftRevision);
        }
    }
    const records = await local.getBlocRecords();
    const pages = await local.getAllPages();
    const assets = await Promise.all(
        artifact.assets.map(async ({ id, bytes }) => ({ id, bytes: new Uint8Array(await bytes.arrayBuffer()) })),
    );
    const next = await store.importRelease({ ...artifact.release, version: "1.1.0" }, assets);
    const plan = await prepareCollectionUpgrade(repository, store, "site", [{ digest: next.digest }], {
        contributors: [],
        requiredConsumers: [],
        validateCapabilities: async () => [],
    });
    expect(plan.issues).toEqual([]);
    expect(plan.status).toBe("applicable");
    for (const tag of ["site-cedar-header", "site-cedar-footer"]) {
        for (const snapshot of ["draft", "published"]) {
            expect(plan.inventory.references).toContainEqual(
                expect.objectContaining({
                    type: "resource",
                    kind: "bloc",
                    id: tag === "site-cedar-header" ? "example--studio--navigation" : "example--studio--footer",
                    location: `local-bloc:${tag}/${snapshot}/structure`,
                    scope: "runtime",
                }),
            );
        }
    }
    expect(await local.getBlocRecords()).toEqual(records);
    expect(await local.getAllPages()).toEqual(pages);
    expect(await store.revision("site")).toBe(1);
});

test.each(["draft", "published"] as const)("upgrades still reject an incompatible %s native root", async (name) => {
    const { repository, local, store } = await reproductionSite();
    const snapshot = await readUsageSnapshot(repository, store, "site", []);
    const record = snapshot.records.find(({ tag }) => tag === "site-cedar-header")!;
    const root = record.siteDefinition![name]!.structure[0]!;
    if (root.kind !== "bloc") {
        throw new Error("Expected a Bloc root");
    }
    root.root = "div";
    const before = await local.getBlocRecords();
    const issues = await validateUpgradeContent(repository, snapshot, [artifact.release]);
    expect(issues).toEqual([
        expect.objectContaining({
            code: "incompatible-content",
            location: `local-bloc:site-cedar-header/${name}/structure`,
            message: expect.stringContaining("root"),
        }),
    ]);
    expect(await local.getBlocRecords()).toEqual(before);
    expect(await store.revision("site")).toBe(1);
});

test("local structure documents preserve nested roots, native content and escaping while omitting template slots", async () => {
    const repository = new InMemoryContentRepository();
    const image = `/.cms/call/ulvia/cms.files/files/file_logo/${"a".repeat(64)}`;
    await createCmsSiteBloc(repository, {
        tag: "site-nested-header",
        name: "Nested header",
        group: "Site",
        content: `<header cms-bloc="example--studio--navigation"><a cms-bloc="example--studio--button" slot="action" href="/?a=1&amp;b=2">Save &amp; close</a><img slot="brand" src="${image}" alt="Logo"></header>`,
    });
    const record = (await repository.getBlocRecord("site-nested-header"))!;
    const snapshot = record.siteDefinition!.draft;
    const root = snapshot.structure[0]!;
    if (root.kind !== "bloc") {
        throw new Error("Expected a Bloc root");
    }
    root.children.push({ kind: "slot", slotId: "links" });
    snapshot.slots = [
        {
            id: "links",
            label: "Links",
            slot: "links",
            accepts: [{ kind: "component", tag: "example--studio--button" }],
        },
    ];
    const documents = localBlocDocuments(record);
    expect(documents["draft/structure"]?.trim()).toBe(
        `<header cms-bloc="example--studio--navigation"><a cms-bloc="example--studio--button" href="/?a=1&b=2" slot="action">Save &amp; close</a><img alt="Logo" slot="brand" src="${image}"></header>`,
    );
    expect(documents["draft/slots"]).toBe('<div cms-bloc="example--studio--button"></div>');
});
