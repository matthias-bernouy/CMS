import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { executeScenarios } from "./assessment";
import type { ScenarioResult } from "../../capabilities/types";

test("one throwing fixture retains an explicit blocked result and cannot hide later scenario attempts", async () => {
    const fixture = await inventoryFixture();
    const attempted: string[] = [];
    const results: ScenarioResult[] = [];
    const scenarios = ["before", "throws", "after"].map((id) => ({
        definition: { ...fixture.scenario, id },
        async execute(environment: { active: boolean }): Promise<ScenarioResult> {
            expect(environment.active).toBe(true);
            attempted.push(id);
            if (id === "throws") {
                throw new Error("private fixture credential must not appear in results");
            }
            return { scenario: id, status: "passed", measurements: [] };
        },
    }));
    await executeScenarios(scenarios, { active: true }, (result) => {
        results.push(result);
    });
    expect(attempted).toEqual(["before", "throws", "after"]);
    expect(results.map((result) => result.status)).toEqual(["passed", "blocked", "passed"]);
    expect(results[1]?.measurements).toEqual([]);
    expect(JSON.stringify(results)).not.toContain("private fixture credential");
});

test("the next scenario waits until its predecessor's asynchronous checkpoint finishes", async () => {
    const fixture = await inventoryFixture();
    const events: string[] = [];
    const scenarios = ["first", "second"].map((id) => ({
        definition: { ...fixture.scenario, id },
        async execute(): Promise<ScenarioResult> {
            events.push(`execute:${id}`);
            return { scenario: id, status: "passed", measurements: [] };
        },
    }));
    await executeScenarios(scenarios, {}, async (result) => {
        await Bun.sleep(5);
        events.push(`persist:${result.scenario}`);
    });
    expect(events).toEqual(["execute:first", "persist:first", "execute:second", "persist:second"]);
});
