import { readProbes, readProbe, deleteProbes } from "./probe";
import { readProfile } from "./profiler";
import { collectMetrics } from "./metrics";
import type { Observation } from "../clients/types";
import type { Measurement, Obligation } from "../../capabilities/types";

export type MeasuredStack = Readonly<{ id: string; providerName: string; edgeName: string }>;

export async function probeHealth(stack: MeasuredStack): Promise<boolean> {
    const [provider, edge] = await Promise.all([readProbe(stack.providerName), readProbe(stack.edgeName)]);
    return (
        ["dispatcher", "mongo", "network"].every((name) =>
            provider.some((row) => row.kind === "instrumentation" && row.component === name),
        ) &&
        ["network", "binding"].every((name) =>
            edge.some((row) => row.kind === "instrumentation" && row.component === name),
        ) &&
        ![...provider, ...edge].some((row) => row.kind === "overflow")
    );
}

export async function measurements(
    stack: MeasuredStack,
    scenario: string,
    obligation: Obligation,
    observations: readonly Observation[],
    phase: "preparation" | "measurement" = "measurement",
): Promise<Measurement[]> {
    const traces = [...new Set(observations.flatMap((row) => [row.traceId, ...(row.relatedTraces ?? [])]))];
    const readAll = async (container: string) => {
        const rows = [];
        for (let offset = 0; offset < traces.length; offset += 100) {
            rows.push(...(await readProbes(container, traces.slice(offset, offset + 100))));
        }
        return rows;
    };
    const profiles = async () => {
        const rows = [];
        for (let offset = 0; offset < traces.length; offset += 1000) {
            rows.push(...(await readProfile(stack.id, traces.slice(offset, offset + 1000))));
        }
        return rows;
    };
    const [provider, edge, profile, healthy] = await Promise.all([
        readAll(stack.providerName),
        readAll(stack.edgeName),
        profiles(),
        probeHealth(stack),
    ]);
    const captured = observations.map(({ failure, ...observation }) => ({
        scenario,
        phase,
        obligation,
        ...observation,
        ...(failure ? { error: failure } : {}),
        ...collectMetrics(
            observation.traceId,
            [...provider, ...edge],
            profile,
            healthy,
            obligation.target,
            observation.relatedTraces,
            Boolean(observation.operation),
            observation.dependencies,
        ),
    }));
    // Keep raw trace files bounded across thousands of scenarios; immutable samples now live in the controller.
    await Promise.all([deleteProbes(stack.providerName, traces), deleteProbes(stack.edgeName, traces)]);
    return captured;
}
