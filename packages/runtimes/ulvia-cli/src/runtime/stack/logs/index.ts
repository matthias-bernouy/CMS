import { readDeploymentState } from "../orchestration/state";
import { streamCommand } from "../../processStream";
import { runCommand } from "../../process";
import { parseRuntimeLogSelection, logComponent, runtimeLogLevel } from "./selection";
import type { UlviaPaths } from "../../paths";

/** Host diagnostics remain available independently of CMS authentication and readiness. */
export async function showRuntimeLogs(
    paths: UlviaPaths,
    args: readonly string[],
    log: (line: string) => void,
): Promise<void> {
    const selection = parseRuntimeLogSelection(args);
    const state = await readDeploymentState(paths);
    if (!state) {
        throw new Error("No deployment logs are available before ulvia apply");
    }
    const target = state.operation?.target ?? state.applied!;
    const result = await runCommand([
        "docker",
        "ps",
        "--all",
        "--filter",
        `label=com.docker.compose.project=${target.projectName}`,
        "--format",
        '{{.ID}}\t{{.Label "com.docker.compose.service"}}',
    ]);
    const rows = result.stdout.trim().split("\n").filter(Boolean);
    if (rows.length > 64) {
        throw new Error("Too many containers in the applied project");
    }
    const containers = rows.map((line) => {
        const [id, service] = line.split("\t");
        if (
            !id ||
            !/^[a-f0-9]{12,64}$/u.test(id) ||
            !service ||
            !/^(?:provider|proxy|mongo|mongo-provision|edge-[1-9][0-9]?)$/u.test(service)
        ) {
            throw new Error("Invalid deployment container identity");
        }
        return { id, service };
    });
    if (selection.services.some((name) => !containers.some(({ service }) => service === name))) {
        throw new Error("Unknown service in runtime log filter");
    }
    const selected = containers.filter(
        ({ service }) =>
            (!selection.services.length || selection.services.includes(service)) &&
            (!selection.components.length || selection.components.includes(logComponent(service))),
    );
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
        const tasks = selected.map(({ id, service }) =>
            streamCommand(
                ["docker", "logs", "--tail", "200", ...(selection.follow ? ["--follow"] : []), id],
                process.env,
                (text) => {
                    if (!selection.levels.length || selection.levels.includes(runtimeLogLevel(text) ?? "")) {
                        log(`${service} | ${text}`);
                    }
                },
                controller.signal,
            ).catch((error) => {
                stop();
                throw error;
            }),
        );
        const results = await Promise.allSettled(tasks);
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") {
            throw failed.reason;
        }
    } finally {
        stop();
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
    }
}
