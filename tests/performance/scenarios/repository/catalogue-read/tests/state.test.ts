import { beforeAll, expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { registryDiscoveryState } from "../metadata/state";
import { prepareDiscoveryRead } from "../metadata/recipe";
import { verifyDiscoveryPages } from "../metadata/pagination";
import { unitPublicResource } from "./model/resource";
import { discoveryModel } from "./model/registry";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { RegistryReadContext } from "../context";

let inventory: CapabilityInventory;
beforeAll(async () => {
    inventory = await performanceCapabilityInventory();
});

test("discovery corpora create 64 distinct identities or 33 real version coordinates per kind without relaxing input contracts", async () => {
    for (const profile of ["large", "history"]) {
        const model = discoveryModel(inventory);
        const state = registryDiscoveryState(
            model.namespace,
            1,
            model.ports,
            model.ports,
            async (...args) => unitPublicResource(...args),
            ["collection", "contract", "provider-manifest"],
        );
        await state.initialize(profile);
        for (const kind of ["collection", "contract", "provider-manifest"] as const) {
            expect(state.visible(kind, false)).toHaveLength(profile === "large" ? 64 : 33);
            expect(state.visible(kind, true)).toHaveLength(profile === "large" ? 64 : 1);
        }
        const rows = state.visible("contract", false);
        await verifyDiscoveryPages(
            model.ports,
            "catalogue-list",
            { kind: "contract", publisherId: model.namespace, limit: 16 },
            rows,
            rows[0]!,
        );
        const latest = state.visible("contract", true);
        await verifyDiscoveryPages(
            model.ports,
            "catalogue-search",
            { kinds: ["contract"], query: latest[0]!.reference.id, publisherId: model.namespace, limit: 16 },
            latest,
            latest[0]!,
        );
        model.assertInputs();
    }
});

test("every metadata invalidation primes before a new publication and rejects stale results; refusals retain the exact publication state", async () => {
    for (const capability of ["catalogue-list", "catalogue-search", "collection-catalogue"]) {
        const model = discoveryModel(inventory);
        const state = registryDiscoveryState(
            model.namespace,
            1,
            model.ports,
            model.ports,
            async (...args) => unitPublicResource(...args),
            ["collection"],
        );
        await state.initialize("invalidation");
        const context: RegistryReadContext = {
            state,
            owner: model.ports,
            read: model.ports,
            foreign: model.ports,
            session: { origin: "http://registry.localhost:5101", cookie: "unit", token: "", tools: [] },
            claimed: {},
        };
        const start = model.inputs.length;
        let invalidCalls = 0;
        const sample = await prepareDiscoveryRead(context, capability, "invalidation", 0, async () => {
            invalidCalls++;
        });
        const events = model.inputs.slice(start).map((row) => row.capability);
        expect(events.indexOf(capability)).toBeLessThan(events.indexOf("publication-begin"));
        expect((await sample.send()).validated).toBe(true);
        await sample.verify?.();
        expect(invalidCalls).toBe(1);
        model.stale();
        expect((await sample.send()).validated).toBe(false);
        const stateInputs = model.inputs.filter((row) => row.capability === "publication-state");
        expect(stateInputs.length).toBeGreaterThan(0);
        expect(
            stateInputs.every((row) => !Object.hasOwn(row.input, "digest") && !Object.hasOwn(row.input, "namespace")),
        ).toBe(true);
    }
});
