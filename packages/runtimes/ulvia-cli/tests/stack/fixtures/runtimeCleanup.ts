import { runCli } from "../../../src/cli";
import { resolveUlviaPaths, resolveLocalInstancePaths } from "../../../src/runtime/paths";
import { loadLocalInstanceConfig } from "../../../src/runtime/instanceConfig";
import { loadLocalInstanceConnection } from "../../../src/runtime/instanceConnection";
import { destroyLocalEdge } from "../../../src/runtime/stack/orchestration/instances";
import { destroyLocalServices } from "../../../src/runtime/stack/orchestration/services";

/** A failed first start may have image pins without a complete instance marker. */
export async function cleanupSmokeRuntime(environment: Record<string, string | undefined>) {
    try {
        await runCli(["reset", "--yes"], { environment, log: () => undefined });
    } catch {
        const paths = resolveUlviaPaths(environment);
        const instance = resolveLocalInstancePaths(paths, "default");
        if ((await loadLocalInstanceConfig(instance.root)) && (await loadLocalInstanceConnection(instance.root))) {
            await destroyLocalEdge(paths, "default");
        }
        await destroyLocalServices(paths);
    }
}
