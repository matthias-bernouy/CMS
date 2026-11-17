import { docker } from "../../integration/instance/docker";
import type { MeasuredStack } from "../harness/docker/collect";
import { RESOURCE_LIMITS } from "../harness/measurements/provenance";

type Memory = Readonly<{ currentBytes: number; peakBytes: number; limitBytes: number; oomKills: number }>;

/** Post-response cgroup-v2 observations, outside client timing; never read application DTOs or credentials. */
export async function stabilityMemory(stack: MeasuredStack) {
    const components = { provider: stack.providerName, edge: stack.edgeName, mongo: `${stack.id}-mongo` };
    return Object.fromEntries(
        await Promise.all(
            Object.entries(components).map(async ([component, name]) => {
                try {
                    const result = await docker([
                        "exec",
                        name,
                        "sh",
                        "-c",
                        "cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.events",
                    ]);
                    const [current, peak, limit, ...events] = result.stdout.trim().split("\n");
                    const memory: Memory = {
                        currentBytes: Number(current),
                        peakBytes: Number(peak),
                        limitBytes: Number(limit),
                        oomKills: Number(
                            events.find((line) => /^oom_kill\s/u.test(line))?.split(/\s+/u)[1] ?? Number.NaN,
                        ),
                    };
                    if (Object.values(memory).some((value) => !Number.isSafeInteger(value) || value < 0)) {
                        throw new Error("Invalid cgroup memory counters");
                    }
                    if (memory.limitBytes !== RESOURCE_LIMITS[component as keyof typeof RESOURCE_LIMITS].memoryBytes) {
                        throw new Error("Unexpected container memory limit");
                    }
                    return [component, memory] as const;
                } catch {
                    return [component, { error: "memory-observation-unavailable" }] as const;
                }
            }),
        ),
    );
}
