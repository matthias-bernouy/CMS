import type { UlviaPaths } from "../../runtime/paths";
import { withRepositoryWriteLock } from "@bernouy/repository/repository/filesystem/lock";
import { configureCommand } from "./configuration";
import { resetLocalInstallation } from "./reset";
import { deploymentCommand } from "./deployment";

export async function localCommand(
    command: string,
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
    environment: Record<string, string | undefined>,
): Promise<void> {
    const mutates =
        ["apply", "start", "stop", "configure", "upgrade", "reset"].includes(command) &&
        !args.includes("--show") &&
        !args.includes("--help") &&
        !args.includes("-h");
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
    if (command === "reset") {
        if (args.length !== 1 || args[0] !== "--yes") {
            throw new Error(
                "Usage: ulvia reset --yes (permanently deletes every local instance and repository release)",
            );
        }
        await resetLocalInstallation(paths, log);
        return;
    }
    await deploymentCommand(command, args, paths, environment, log);
}
