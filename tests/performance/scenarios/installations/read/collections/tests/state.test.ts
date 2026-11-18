import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../capabilities/inventory";
import { prepareCollectionCorpus } from "../context/corpus";
import { collectionStateModel } from "./model";
import { collectionPageInput, verifyCollectionPages } from "../read/pages";
import { assertCollectionPage } from "../read/metadata";
import { requireRecord } from "../../../../queries/types";
import { collectionReaderScenarios } from "../plan";
import { nextCollectionReadCoordinate } from "../resources/collection";

test("large and history preparation perform bounded real-command schedules with async completion and retained upgrade identities", async () => {
    const inventory = await performanceCapabilityInventory();
    for (const profile of ["large", "history"]) {
        const { state, calls, requests } = await collectionStateModel(inventory);
        await prepareCollectionCorpus(state, profile);
        expect(state.resources).toHaveLength(profile === "large" ? 96 : 33);
        expect(state.installed.size).toBe(profile === "large" ? 64 : 1);
        expect(state.revision()).toBe(33);
        expect(state.upgrades).toHaveLength(32);
        expect(new Set(state.upgrades.map((row) => row.operationId)).size).toBe(32);
        expect(calls.filter((row) => row === "install-collections")).toHaveLength(1);
        expect(calls.filter((row) => row === "apply-collection-upgrade")).toHaveLength(32);
        expect(calls.filter((row) => row === "get-operation")).toHaveLength(32);
        expect(calls.filter((row) => row === "get-collection-upgrade")).toHaveLength(32);
        expect([...state.installed.values()][0]!.version).toBe("1.0.32");
        const history = profile === "history";
        const page = await collectionPageInput(state, history, profile, history ? 8 : 3);
        expect(page.offset).toBe(history ? 32 : 48);
        const capability = history ? "list-collection-releases" : "list-collection-catalogue";
        const response = await state.tenant.client("ulvia/cms.installations", capability, "http", page.input, (value) =>
            assertCollectionPage(value, state, history, page.offset, 16),
        );
        expect(requireRecord(response.output).releases).toHaveLength(history ? 1 : 16);
        requests.length = 0;
        await verifyCollectionPages(state, history);
        expect(requests.filter((row) => row.capability === capability)).toHaveLength(history ? 3 : 4);
    }
});

test("all sixteen mutable reader cases share bounded tracked state without reusing immutable coordinates or provisioning another tenant", async () => {
    const inventory = await performanceCapabilityInventory();
    const { state } = await collectionStateModel(inventory);
    await prepareCollectionCorpus(state, "invalidation");
    const cases = collectionReaderScenarios(inventory, "unit-plan").filter(
        (row) => row.definition.obligations[0]!.variant === "invalidation",
    );
    expect(cases).toHaveLength(16);
    for (const scenario of cases) {
        const capability = inventory.targets.find((row) => row.key === scenario.definition.obligations[0]!.target)!
            .definition.id;
        for (let sample = 0; sample < 10; sample++) {
            if (["get-collection-details", "get-collection-installation"].includes(capability)) {
                await state.configure(`Independent title ${sample}`);
                continue;
            }
            const installing = ["list-collection-installations", "list-installed-collections"].includes(capability);
            const coordinate = nextCollectionReadCoordinate(state.resources, installing);
            const resource = await state.create(coordinate.index, coordinate.patch);
            await state.publish(resource);
            if (installing) {
                await state.install([resource]);
            } else if (capability === "get-collection-release") {
                await state.upgrade(resource);
            }
        }
    }
    expect(state.resources).toHaveLength(121);
    expect(new Set(state.resources.map((row) => `${row.id}@${row.version}`)).size).toBe(121);
    expect(state.installed.size).toBe(41);
    expect(state.upgrades).toHaveLength(20);
    expect(state.revision()).toBe(101);
    expect(Math.max(...state.resources.map((row) => row.index))).toBe(40);
    expect(Math.max(...state.resources.map((row) => row.patch))).toBe(80);
});

test("configuration invalidation retains its independent expected value without warming the reader before timing", async () => {
    const { state, calls } = await collectionStateModel(await performanceCapabilityInventory());
    await prepareCollectionCorpus(state, "invalidation");
    await state.configure("Measured title");
    expect(state.revision()).toBe(2);
    expect(state.title()).toBe("Measured title");
    expect(calls).not.toContain("get-collection-details");
    expect(calls.filter((row) => row === "update-collection-configuration")).toHaveLength(1);
    await expect(state.install([...state.installed.values()])).rejects.toThrow("bound");
    expect(state.revision()).toBe(2);
});
