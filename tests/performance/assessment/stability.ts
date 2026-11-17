import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assessCapabilities } from "./run";
import { initializationScenarios } from "../scenarios/initialization/plan";
import { measurements } from "../harness/docker/collect";
import { stabilityMemory } from "./memory";
import type { CapabilityInventory } from "../capabilities/types";

const version = Bun.argv[2] ?? "0.1.0-initialization-cold-2";
const resources: {
    traceId: string;
    binding: string;
    durationMs: number;
    memory: Awaited<ReturnType<typeof stabilityMemory>>;
}[] = [];
const collect: typeof measurements = async (...args) => {
    const captured = await measurements(...args);
    for (const sample of captured.filter((entry) => entry.phase === "measurement")) {
        resources.push({
            traceId: sample.traceId,
            binding: sample.obligation.binding,
            durationMs: sample.durationMs,
            memory: await stabilityMemory(args[0]),
        });
        console.log(
            `Cold call ${resources.length}/30: ${sample.obligation.binding} ${sample.durationMs.toFixed(0)} ms, validated=${sample.validated}`,
        );
    }
    return captured;
};
const select = (inventory: CapabilityInventory, fixture: string) => {
    const scenarios = initializationScenarios(inventory, fixture, 15, collect).filter(({ definition }) =>
        ["initialization.plan.mossa.http.cold", "initialization.plan.mossa.mcp.cold"].includes(definition.id),
    );
    if (scenarios.length !== 2 || scenarios.reduce((sum, entry) => sum + entry.definition.samples, 0) !== 30) {
        throw new Error("The stability campaign must contain exactly 30 cold Mossa calls");
    }
    return scenarios;
};
const result = await assessCapabilities(
    { edge: `cyaxis/ulvia-edge:${version}`, provider: `cyaxis/ulvia-provider:${version}` },
    undefined,
    select,
    { contractId: "ulvia/cms.installations", capabilityId: "initialization.plan" },
);
const directory = resolve("artifacts/performance/stability", result.report.metadata.id);
await mkdir(directory, { recursive: true });
const json = `${JSON.stringify({ run: result.report.metadata.id, requested: 30, samples: resources }, null, 2)}\n`;
await writeFile(resolve(directory, "memory.json"), json, { flag: "wx" });
await writeFile(
    resolve(directory, "complete.json"),
    `${JSON.stringify({ memorySha256: createHash("sha256").update(json).digest("hex") })}\n`,
    { flag: "wx" },
);
console.log(`Memory observations: ${directory}`);
process.exitCode = result.report.status === "passed" ? 0 : 1;
