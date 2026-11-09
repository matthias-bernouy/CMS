import type { UlviaPaths } from "../../runtime/paths";
import { withRepositoryWriteLock } from "@bernouy/repository/repository/filesystem/lock";
import { configureCommand } from "./configure";
import { resetLocalInstallation } from "./reset";
import { startShared, servicesCommand } from "./services";
import { upgradeCommand } from "./upgrade";

export async function localCommand(
    command: string,
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
    environment: Record<string, string | undefined>,
): Promise<void> {
    const mutates =
        ["start", "configure", "upgrade", "reset"].includes(command) ||
        (command === "services" && ["start", "stop"].includes(args[0] ?? ""));
    const execute = () => dispatchLocalCommand(command, args, paths, log, environment);
    if (mutates) {
        // Keep the root lock inode across reset; process death releases the native lease.
        await withRepositoryWriteLock(paths.data, execute);
        return;
    }
    await execute();
}

async function dispatchLocalCommand(
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
    if (command === "services") {
        await servicesCommand(args, paths, environment, log);
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
        throw new Error("Usage: ulvia start [--version <version>] [--domain <hostname>]");
    }
    if (args.length === 1 && ["help", "--help", "-h"].includes(args[0] ?? "")) {
        log(`Usage: ulvia start [--version <version>] [--domain <hostname>]

Start Provider, MongoDB, Caddy and shared Edges. The Provider initializes empty Control.`);
        return;
    }
    await startShared(args, paths, environment, log);
    log(`Persistent data: ${paths.data}`);
}
