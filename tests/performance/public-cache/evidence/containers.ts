import { docker, waitForHttp } from "../../../integration/instance/docker";
import type { mcpContainers } from "../../../integration/instance/containers";
export type Stack = Awaited<ReturnType<typeof mcpContainers>>;

/** Inspect only non-secret fields. Never persist Config.Env or credentials. */
export async function observeContainer(name: string) {
    const inspect = JSON.parse((await docker(["inspect", name])).stdout)[0];
    const usage = await docker(
        [
            "exec",
            name,
            "sh",
            "-c",
            "cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.events",
        ],
        true,
    );
    return {
        name,
        image: inspect.Image as string,
        startedAt: inspect.State.StartedAt as string,
        oomKilled: inspect.State.OOMKilled as boolean,
        limits: { nanoCpus: inspect.HostConfig.NanoCpus as number, memoryBytes: inspect.HostConfig.Memory as number },
        cgroup: usage.code === 0 ? usage.stdout.trim() : null,
    };
}

export async function restart(stack: Stack, provider: boolean) {
    const started = performance.now();
    if (provider) {
        await stack.restartProvider(0);
    }
    await docker(["restart", "--time", "0", stack.edgeName]);
    // Global readiness never requests the measured Page or warms its tenant context.
    await waitForHttp(`${stack.cmsUrl}/readyz`);
    return {
        preparationMs: performance.now() - started,
        edge: await observeContainer(stack.edgeName),
        provider: await observeContainer(stack.providerName),
    };
}
