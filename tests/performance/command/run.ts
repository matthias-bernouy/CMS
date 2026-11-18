import { performanceOptions } from "./options";
import { performancePlan } from "./planning";
import { selectScenarios } from "../assessment/selection";
import type { PerformanceOptions } from "./options";
import type { PerformancePlan } from "./planning";

type Ports = Readonly<{
    plan: () => Promise<PerformancePlan>;
    execute: (options: PerformanceOptions) => Promise<number>;
    write: (text: string) => void;
}>;

const defaults: Ports = {
    plan: performancePlan,
    execute: async (options) => (await import("./execute")).executePerformance(options),
    write: (text) => console.log(text),
};

/** Selection is validated before even importing the measured runner and its build orchestration. */
export async function performanceCommand(args: readonly string[], ports: Ports = defaults) {
    const options = performanceOptions(args);
    const plan = await ports.plan();
    const selected = selectScenarios(plan.scenarios, options.scenarioIds);
    if (options.list) {
        ports.write(selected.map((row) => row.definition.id).join("\n"));
        return 0;
    }
    return ports.execute({
        ...options,
        scenarioIds: options.scenarioIds.length ? selected.map((row) => row.definition.id) : [],
    });
}

if (import.meta.main) {
    try {
        process.exitCode = await performanceCommand(Bun.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : "Performance command failed");
        process.exitCode = 1;
    }
}
