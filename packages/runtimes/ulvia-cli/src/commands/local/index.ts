import type { UlviaPaths } from "../../runtime/paths";
import { loadOrCreateInstallationConfig } from "../../runtime/stack/installation";
import { listLocalInstanceNames, startLocalEdge } from "../../runtime/stack/orchestration/instances";
import { startLocalServices } from "../../runtime/stack/orchestration/services";
import { configureCommand } from "./configure";
import { instanceCommand } from "./instances";
import { resetLocalInstallation } from "./reset";
import { parseStartVersion, servicesCommand } from "./services";
import { upgradeCommand } from "./upgrade";

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
    if (command === "upgrade") {
        await upgradeCommand(args, paths, log);
        return;
    }
    if (command === "reset") {
        if (args.length !== 1 || args[0] !== "--yes") {
            throw new Error(
                "Usage: ulvia reset --yes (permanently deletes every local instance and repository release)",
            );
        }
        await resetLocalInstallation(paths, log);
        return;
    }
    if (command !== "start") {
        throw new Error("Usage: ulvia start [--version <version>]");
    }
    if (args.length === 1 && ["help", "--help", "-h"].includes(args[0] ?? "")) {
        log(`Usage: ulvia start [--version <version>]

Start shared services and every existing instance. The exact version only
selects Provider and Repository images when shared services are uninitialized.`);
        return;
    }
    const requestedVersion = parseStartVersion(args, "Usage: ulvia start [--version <version>]");
    await startLocalServices(paths, installation, log, requestedVersion);
    const instances = await listLocalInstanceNames(paths);
    if (instances.length === 0) {
        log("Shared services are ready. Create an instance with: ulvia instance create <name>");
    } else {
        const failures: string[] = [];
        for (const name of instances) {
            try {
                await startLocalEdge(paths, name, log);
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
