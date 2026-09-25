import { describe, expect, test } from "bun:test";
import { InMemoryContractSelectionStore, planContractSelections } from "@bernouy/cms-repository/providers/selections";
import { graphFixture, siteId } from "./fixtures";

async function fixture() {
    const graph = await graphFixture();
    let dependencyRevision = "dependencies:1";
    const store = new InMemoryContractSelectionStore({
        capture: async () => ({ ...graph.context, revision: dependencyRevision }),
        isCurrent: async (_site, revision) => revision === dependencyRevision,
    });
    return {
        ...graph,
        store,
        changeDependencies: () => {
            dependencyRevision = "dependencies:2";
        },
    };
}

describe("atomic contract selection storage", () => {
    test("replaces the complete site with optimistic revisions and independent immutable reads", async () => {
        const { store, select } = await fixture();
        expect(await store.get(siteId)).toBeNull();
        const first = await store.replace(siteId, [await select("payment")], 0);
        expect(first.revision).toBe(1);
        const read = await store.get(siteId);
        expect(read).toEqual(first);
        expect(read).not.toBe(first);
        expect(read!.plan).not.toBe(first.plan);
        expect(Object.isFrozen(read!.plan.selections[0])).toBe(true);
        const cleared = await store.replace(siteId, [], 1);
        expect(cleared.plan.selections).toEqual([]);
        expect(cleared.revision).toBe(2);
        await expect(store.replace(siteId, [], 1)).rejects.toMatchObject({ code: "revision_conflict" });
    });

    test("only one concurrent replacement of the same revision succeeds", async () => {
        const { store, select } = await fixture();
        const first = await select("payment");
        const second = await select("payment", "2.0.0");
        const results = await Promise.allSettled([
            store.replace(siteId, [first], 0),
            store.replace(siteId, [second], 0),
        ]);
        expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
        expect((await store.get(siteId))!.plan.selections).toEqual([first]);
    });

    test("failure is atomic, does not poison the queue and cannot accept a fabricated plan", async () => {
        const { store, select, context } = await fixture();
        const payment = await select("payment");
        const initial = await store.replace(siteId, [payment], 0);
        const plan = await planContractSelections(siteId, [payment], context);
        await expect(store.replace(siteId, { ...plan, structurallyValid: true }, 1)).rejects.toThrow();
        await expect(store.replace(siteId, [await select("commerce")], 1)).rejects.toMatchObject({
            code: "missing_dependency",
        });
        expect(await store.get(siteId)).toEqual(initial);
        expect((await store.replace(siteId, [], 1)).revision).toBe(2);
    });

    test("recomputes current dependencies and retains historical snapshots after yanks", async () => {
        const { store, select, releases, changeDependencies } = await fixture();
        const payment = await select("payment");
        const stored = await store.replace(siteId, [payment], 0);
        await releases.setYank("payment", "1.0.0", { reason: "withdrawn" });
        changeDependencies();
        expect(await store.get(siteId)).toEqual(stored);
        await expect(store.replace(siteId, stored.plan.selections, 1)).rejects.toMatchObject({
            code: "yanked_dependency",
        });
        expect(await store.get(siteId)).toEqual(stored);
    });

    test("rejects dependency changes during asynchronous planning before committing", async () => {
        const { context, select } = await graphFixture();
        let revision = "before";
        const store = new InMemoryContractSelectionStore({
            capture: async () => ({ ...context, revision }),
            isCurrent: async (_site, captured) => {
                revision = "after";
                return captured === revision;
            },
        });
        await expect(store.replace(siteId, [await select("payment")], 0)).rejects.toMatchObject({
            code: "stale_dependencies",
        });
        expect(await store.get(siteId)).toBeNull();
    });

    test("captures proposed pins before waiting for an earlier replacement", async () => {
        const { store, select } = await fixture();
        const payment = { ...(await select("payment")) };
        const first = store.replace(siteId, [], 0);
        const second = store.replace(siteId, [payment], 1);
        payment.version = "99.0.0";
        await first;
        expect((await second).plan.selections[0]!.version).toBe("1.0.0");
    });
});
