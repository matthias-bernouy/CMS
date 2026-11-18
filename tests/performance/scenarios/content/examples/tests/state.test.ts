import { beforeAll, expect, test } from "bun:test";
import { inventoryFixture } from "../../../../fixtures/inventory";
import { publicationCollection } from "../../../repository/resources/collection";
import { exampleSources } from "../resource/source";
import { exampleReadState } from "../state";
import { prepareExampleRead } from "../recipe";
import { exampleModel } from "./model";
import type { ExampleResource } from "../resource/publish";
import type { Observation } from "../../../../harness/clients/types";
import type { ScenarioClient } from "../../../../harness/clients/session";

let resource: ExampleResource;
let observation: Observation;
beforeAll(async () => {
    const fixture = await inventoryFixture();
    observation = fixture.measurement;
    const suffix = "examples-state";
    const id = `performance-unit/fixture-collection-${suffix}`;
    resource = await publicationCollection("performance-unit", fixture.target.release, exampleSources(id, "1.0.0"), {
        suffix,
    });
});

test("example history completes eight durable upgrades and preserves unrelated installations", async () => {
    const model = exampleModel(resource, observation);
    const initial = JSON.stringify(model.unrelated);
    const state = exampleReadState(model.ports, "history", async (_profile, patch) => model.candidates[patch]!);
    await state.initialize();
    expect(state.current.version).toBe("1.0.8");
    expect(state.upgrades).toHaveLength(8);
    expect(new Set(state.upgrades).size).toBe(8);
    expect(model.polls()).toBe(8);
    expect(state.revision).toBe(10);
    expect(JSON.stringify(model.unrelated)).toBe(initial);
    await state.snapshot();
});

test("example invalidation primes before durable upgrade, times one read and rejects stale documents", async () => {
    for (const capability of ["examples.list", "examples.get"]) {
        const model = exampleModel(resource, observation);
        const state = exampleReadState(
            model.ports,
            "invalidation",
            async (_profile, patch) => model.candidates[patch]!,
        );
        await state.initialize();
        let invalid = 0;
        const other: ScenarioClient = async () => ({
            output: undefined,
            observation: { ...observation, validated: false, status: 422 },
        });
        const sample = await prepareExampleRead(
            state,
            capability,
            "mcp",
            true,
            0,
            other,
            "foreign=session",
            async () => {
                invalid++;
            },
        );
        expect(model.events.indexOf(capability)).toBeLessThan(model.events.indexOf("apply-collection-upgrade"));
        expect(state.current.version).toBe("1.0.1");
        const before = model.events.length;
        expect((await sample.send()).validated).toBe(true);
        expect(model.events.length - before).toBe(1);
        await sample.verify!();
        expect(invalid).toBe(1);
        model.stale();
        await expect(sample.send()).rejects.toThrow(
            capability === "examples.list" ? "example-exact-page" : "example-exact-document",
        );
    }
});

test("example refusals cannot change the installation snapshot", async () => {
    const model = exampleModel(resource, observation);
    const state = exampleReadState(model.ports, "large", async (_profile, patch) => model.candidates[patch]!);
    await state.initialize();
    const sample = await prepareExampleRead(
        state,
        "examples.list",
        "http",
        false,
        1,
        async () => ({ output: undefined, observation: { ...observation, validated: false, status: 422 } }),
        "foreign=session",
        async () => {
            model.unrelated.version = "unexpected mutation";
        },
    );
    await sample.send();
    await expect(sample.verify!()).rejects.toThrow("example-unrelated-installations-changed");
});
