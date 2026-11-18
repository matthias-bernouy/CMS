import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../../../capabilities/inventory";
import { collectionStateModel } from "../../../tests/model";
import { prepareCollectionCorpus } from "../../../context/corpus";
import { collectionReadResource } from "../../../resources/collection";
import { usageReadContexts } from "../context";
import type { QueryEnvironment } from "../../../../../../queries/execute";

/** Only page persistence is simulated here; these invocations never enter the measurement collector. */
test("usage fixture coalesces owned pages, alternates disjoint real identities and latches unknown writes", async () => {
    const inventory = await performanceCapabilityInventory();
    const { state } = await collectionStateModel(inventory);
    await prepareCollectionCorpus(state, "invalidation");
    const documents = new Map<string, Readonly<Record<string, unknown>>>();
    let writes = 0;
    let fail = false;
    const fixture: typeof state.tenant.fixture = async (capability, input = {}, contract) => {
        if (contract !== "ulvia/cms.content") {
            return state.tenant.fixture(capability, input, contract);
        }
        writes++;
        if (fail) {
            throw new Error("Unit unknown write outcome");
        }
        if (capability === "pages.create") {
            const page = { ...input, id: `unit-page-${documents.size}`, revision: 1, visible: false };
            documents.set(page.id, page);
            return page;
        }
        const before = documents.get(String(input.id))!;
        expect(input.expectedRevision).toBe(before.revision);
        const { expectedRevision: _revision, ...fields } = input;
        const page = { ...before, ...fields, revision: Number(before.revision) + 1 };
        documents.set(String(input.id), page);
        return page;
    };
    const implementation = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.content",
    )!.release;
    const bound = {
        ...state,
        create: (index: number, patch: number) =>
            collectionReadResource(state.namespace, implementation, index, patch, false),
        tenant: { ...state.tenant, fixture },
    };
    const contexts = usageReadContexts(inventory, async () => bound);
    const environment = {} as QueryEnvironment;
    const first = contexts(environment, "invalidation");
    const context = await first;
    expect(await contexts(environment, "invalidation")).toBe(context);
    expect(documents.size).toBe(1);
    expect(state.installed.size).toBe(2);
    const original = new Set(context.expected().keys());
    const tag = context.pages[0]!.tags[0];
    for (let index = 0; index < 20; index++) {
        await context.mutate();
        expect(context.pages[0]!.tags[0] === tag).toBe(index % 2 === 1);
        expect(context.pages[0]!.revision).toBe(4 + index * 2);
    }
    expect(new Set(context.expected().keys())).toEqual(original);
    const beforeBound = writes;
    await expect(context.mutate()).rejects.toThrow("mutation-bound");
    expect(writes).toBe(beforeBound);
    const otherContexts = usageReadContexts(inventory, async () => bound);
    const other = await otherContexts(environment, "invalidation");
    fail = true;
    await expect(other.mutate()).rejects.toThrow("unknown write");
    const beforeFailure = writes;
    await expect(other.mutate()).rejects.toThrow("mutation-bound-or-unknown");
    expect(writes).toBe(beforeFailure);
});
