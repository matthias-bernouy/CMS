import { expect, test } from "bun:test";
import { performancePlan } from "./planning";
import { performanceCommand } from "./run";
import { selectScenarios } from "../assessment/selection";
import { performanceSteps } from "./execute";

const plan = await performancePlan();

test("listing real scenarios never builds images or executes the measured runner", async () => {
    const output: string[] = [];
    let executed = 0;
    const ports = {
        plan: async () => plan,
        write: (text: string) => {
            output.push(text);
        },
        execute: async () => {
            executed++;
            return 1;
        },
    };
    expect(await performanceCommand(["--list"], ports)).toBe(0);
    expect(output[0]!.split("\n")).toEqual(plan.scenarios.map((row) => row.definition.id));
    expect(executed).toBe(0);
    output.length = 0;
    const id = plan.scenarios[0]!.definition.id;
    expect(await performanceCommand(["--list", "--scenario", id], ports)).toBe(0);
    expect(output).toEqual([id]);
    await expect(performanceCommand(["--scenario", id, "--scenario", "missing-scenario"], ports)).rejects.toThrow(
        "Unknown performance scenario",
    );
    expect(executed).toBe(0);
});

test("multiple exact scenarios preserve canonical order and never silently widen the selection", async () => {
    const first = plan.scenarios[0]!.definition.id;
    const second = plan.scenarios[1]!.definition.id;
    expect(selectScenarios(plan.scenarios, [second, first, first]).map((row) => row.definition.id)).toEqual([
        first,
        second,
    ]);
    let received: readonly string[] = [];
    const result = await performanceCommand(["--scenario", second, "--scenario", first], {
        plan: async () => plan,
        write: () => {
            throw new Error("Unexpected listing");
        },
        execute: async (options) => {
            received = options.scenarioIds;
            return 7;
        },
    });
    expect(received).toEqual([first, second]);
    expect(result).toBe(7);
});

test("targeted runs keep one candidate build and skip unrelated supplementary benchmarks", () => {
    const focused = performanceSteps(true);
    expect(focused.preparation.filter((row) => row.args.includes("infra/images/build.ts"))).toHaveLength(1);
    expect(focused.supplementary).toEqual([]);
    expect(performanceSteps(false).supplementary.map((row) => row.args.at(-1))).toEqual([
        "tests/performance/benchmarks/run.ts",
        "tests/performance/benchmarks/collections/repository/run.ts",
        "tests/performance/delivery/run.ts",
    ]);
});
