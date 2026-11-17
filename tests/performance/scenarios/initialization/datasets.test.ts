import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { planCollectionInitialization } from "@bernouy/repository/collections/installations";
import { inventoryFixture } from "../../fixtures/inventory";
import { bootstrapDataset } from "./datasets";
import { assertInitializationReview } from "./review";
import { expectedAfterRestarts } from "./state";

test("initialization performance fixtures admit real recipes, large previews, exact includes and bounded assets", async () => {
    const fixture = await inventoryFixture();
    for (const pages of [1, 25, 100]) {
        const candidate = await bootstrapDataset(fixture.target.release, `pages-${pages}`, pages);
        const plan = await planCollectionInitialization(
            candidate.dataset.root,
            [{ release: candidate.artifact.release, digest: candidate.artifact.digest }],
            { selected: [] },
        );
        expect(plan.pages.map((page) => page.path).toSorted()).toEqual(candidate.dataset.paths.toSorted());
    }
    const child = await bootstrapDataset(fixture.target.release, "child", 3);
    const root = await bootstrapDataset(fixture.target.release, "root", 1, [child.dataset]);
    const plan = await planCollectionInitialization(
        root.dataset.root,
        [root, child].map(({ artifact }) => ({ release: artifact.release, digest: artifact.digest })),
        { selected: [] },
    );
    expect(plan.pages).toHaveLength(4);
    expect(plan.collections).toHaveLength(2);
    const asset = await bootstrapDataset(fixture.target.release, "assets", 1, [], "1.0.0", 512 * 1024);
    expect(asset.artifact.assets.reduce((sum, item) => sum + item.bytes.size, 0)).toBe(512 * 1024);
    const scope = { site: { instanceId: "instance-performance" }, main: { subjectId: "member-performance" } };
    const evidence = {
        instanceId: scope.site.instanceId,
        siteId: "default",
        actorId: scope.main.subjectId,
        expectedRevision: 0,
        systemRevision: 0,
        collectionRevision: 0,
        executionFingerprint: `sha256:${"1".repeat(64)}`,
        plan,
    };
    const digest = `sha256:${createHash("sha256").update(canonicalizeIJson(evidence)).digest("hex")}`;
    const output = { planDigest: digest, reviewJson: canonicalizeIJson({ ...evidence, digest }) };
    expect(assertInitializationReview(output, scope, root.dataset).digest).toBe(digest);
    expect(() => assertInitializationReview({ ...output, planDigest: "wrong" }, scope, root.dataset)).toThrow();
    expect(() =>
        assertInitializationReview(output, { ...scope, site: { instanceId: "foreign" } }, root.dataset),
    ).toThrow();
    expect(() => assertInitializationReview(output, scope, { ...root.dataset, paths: [] })).toThrow();
});

test("cold postconditions charge only the independently calibrated runtime revision increment", () => {
    const before = {
        status: { status: "pending", revision: 0 },
        pages: { items: [] },
        collections: { revision: 0, items: [] },
        settings: { revision: 1, name: "" },
    };
    expect(expectedAfterRestarts(before, 3)).toEqual({ ...before, settings: { ...before.settings, revision: 4 } });
    expect(before.settings.revision).toBe(1);
    expect(() => expectedAfterRestarts(before, -1)).toThrow();
});
