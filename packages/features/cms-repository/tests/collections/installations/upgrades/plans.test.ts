import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/cms-content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import {
    prepareCollectionUpgrade,
    type CollectionUpgradeAnalysis,
} from "../../../../src/collections/installations/upgrades/planning/plan";
import { collectionDocument } from "../../fixtures";
import { collectionFixture } from "../../admission/examples/buildFixture";
import { parseCollectionRelease } from "@bernouy/cms-repository/collections";

const analysis: CollectionUpgradeAnalysis = {
    contributors: [],
    requiredConsumers: [],
    validateCapabilities: async () => [],
};
async function fixture() {
    const repo = new InMemoryContentRepository();
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const source = collectionDocument({ "retired.reason": "Use the new panel" }) as any;
    source.blocs[0].deprecation = {
        reason: "retired.reason",
        replacedBy: "atlas-new-panel",
        sunsetAt: "2020-01-01T00:00:00.000Z",
    };
    const replacement = { ...source.blocs[0], id: "atlas-new-panel", catalogue: "hidden" };
    delete replacement.deprecation;
    delete replacement.examples;
    delete replacement.defaultExample;
    source.blocs.push(replacement);
    const old = await collections.importRelease(collectionFixture(source));
    await collections.install("site", old.digest, 0);
    const target = { ...source, version: "2.0.0", blocs: [replacement], examples: [] };
    const next = await collections.importRelease(collectionFixture(target));
    return { repo, collections, next, source };
}

test("unused resources can be removed without transforming any Page", async () => {
    const f = await fixture();
    const before = await f.repo.getAllPages();
    const plan = await prepareCollectionUpgrade(f.repo, f.collections, "site", [{ digest: f.next.digest }], analysis);
    expect(plan.status).toBe("applicable");
    expect(plan.resources).toContainEqual({
        collectionId: "atlas",
        kind: "bloc",
        id: "atlas-panel",
        change: "removed",
        replacement: "atlas-new-panel",
    });
    expect(await f.repo.getAllPages()).toEqual(before);
    expect(await f.collections.revision("site")).toBe(1);
});

test.each([false, true])("both draft and published Pages block removed resources (visible=%s)", async (visible) => {
    const f = await fixture();
    await f.repo.insertPage("/example", "Example", '<div cms-bloc="atlas-panel"></div>');
    const pageId = (await f.repo.getPage("/example"))!.id;
    await f.repo.updatePage({ id: pageId, visible });
    const plan = await prepareCollectionUpgrade(f.repo, f.collections, "site", [{ digest: f.next.digest }], analysis);
    expect(plan.status).toBe("blocked");
    expect(plan.issues).toContainEqual(
        expect.objectContaining({
            code: "missing-resource",
            replacement: "atlas-new-panel",
            location: expect.stringContaining("/example"),
        }),
    );
    expect((await f.repo.getPage("/example"))!.content).toContain("atlas-panel");
});

test("unknown internal consumers make the analysis incomplete", async () => {
    const f = await fixture();
    const plan = await prepareCollectionUpgrade(f.repo, f.collections, "site", [{ digest: f.next.digest }], {
        ...analysis,
        requiredConsumers: ["edge"],
    });
    expect(plan.status).toBe("incomplete");
    expect(plan.inventory.unknown).toContain("Missing authoritative consumer inventory: edge");
});

test("explicit target configuration is validated only against the new schema", async () => {
    const f = await fixture();
    const previous = {
        ...f.source,
        collectionId: "config",
        blocs: [],
        examples: [],
        configuration: {
            schema: { type: "object", properties: { value: { type: "string", maxLength: 8 } }, required: ["value"] },
            defaults: { value: "old" },
        },
    };
    const old = await f.collections.importRelease(collectionFixture(previous));
    await f.collections.install("site", old.digest, 1);
    const target = {
        ...previous,
        version: "2.0.0",
        configuration: {
            schema: { type: "object", properties: { count: { type: "integer", minimum: 1 } }, required: ["count"] },
            defaults: { count: 1 },
        },
    };
    const next = await f.collections.importRelease(collectionFixture(target));
    const blocked = await prepareCollectionUpgrade(f.repo, f.collections, "site", [{ digest: next.digest }], analysis);
    expect(blocked.status).toBe("blocked");
    const applicable = await prepareCollectionUpgrade(
        f.repo,
        f.collections,
        "site",
        [{ digest: next.digest, configuration: { count: 3 } }],
        analysis,
    );
    expect(applicable.status).toBe("applicable");
    expect(applicable.replacements.find(({ collectionId }) => collectionId === "config")!.configuration).toEqual({
        count: 3,
    });
});

test("resource replacement metadata rejects missing targets and cycles", () => {
    const source: any = collectionDocument({ reason: "Replaced" });
    source.blocs[0].deprecation = { reason: "reason", replacedBy: "missing" };
    expect(() => parseCollectionRelease(source)).toThrow("replacement");
    source.blocs[0].deprecation.replacedBy = source.blocs[0].id;
    expect(() => parseCollectionRelease(source)).toThrow("cyclic");
});
