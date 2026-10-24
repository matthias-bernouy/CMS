import type { UlviaPaths } from "../../runtime/paths";
import { loadOrCreateInstallationConfig } from "../../runtime/stack/installation";
import { listLocalInstanceNames, startLocalKernel } from "../../runtime/stack/orchestration/instances";
import { startLocalServices } from "../../runtime/stack/orchestration/services";
import { bootstrapOfficialRepository } from "../bootstrap";
import { configureCommand } from "./configure";
import { instanceCommand } from "./instances";
import { resetLocalInstallation } from "./reset";
import { servicesCommand } from "./services";

export async function localCommand(
    command: string,
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
    environment: Record<string, string | undefined>,
): Promise<void> {
    if (command === "configure") {
        await configureCommand(args, paths, environment, log);
        return;
    }
    const installation = await loadOrCreateInstallationConfig(paths, environment);
    if (command === "services") {
        await servicesCommand(args, paths, installation, log);
        return;
    }
    if (command === "instance") {
        await instanceCommand(args, paths, installation, log);
        return;
    }
    if (command === "reset") {
        if (args.length !== 1 || args[0] !== "--yes") {
            throw new Error(
                "Usage: ulvia reset --yes (permanently deletes every local instance and repository release)",
            );
        }
        await resetLocalInstallation(paths, installation, log);
        return;
    }
    if (command !== "start" || args.length > 0) {
        throw new Error("Usage: ulvia start");
    }
    await startLocalServices(paths, installation, log, {
        prepare: async () => {
            log("Preparing bundled official resources...");
            await bootstrapOfficialRepository(paths.repository);
        },
    });
    const instances = await listLocalInstanceNames(paths);
    if (instances.length === 0) {
        log("Shared services are ready. Create an instance with: ulvia instance create <name>");
    } else {
        const failures: string[] = [];
        for (const name of instances) {
            try {
                await startLocalKernel(paths, name, log);
            } catch (error) {
                failures.push(name);
                log(`Instance ${name} failed to start: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (failures.length > 0) {
            throw new Error(`Failed to start ${failures.length} local instance(s): ${failures.join(", ")}`);
        }
    }
    log(`Persistent data: ${paths.data}`);
}
