import { runCli } from "../../../src/cli";
import { resolveUlviaPaths } from "../../../src/runtime/paths";
import { destroyLocalServices } from "../../../src/runtime/stack/orchestration/services";
import { loadLocalServicesState } from "../../../src/runtime/stack/orchestration/state";

/** Launch intent is persisted before Compose creates any durable service. */
export async function cleanupSmokeRuntime(environment: Record<string, string | undefined>) {
    try {
        await runCli(["reset", "--yes"], { environment, log: () => undefined });
    } catch (cause) {
        const paths = resolveUlviaPaths(environment);
        if (!(await loadLocalServicesState(paths))) {
            throw cause;
        }
        await destroyLocalServices(paths);
    }
}
