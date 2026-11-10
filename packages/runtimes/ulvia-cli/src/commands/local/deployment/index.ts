import { applyInstallation } from "../../../runtime/stack/orchestration/deployment/apply";
import { startLocalServices, stopLocalServices } from "../../../runtime/stack/orchestration/services";
import { showInstallationStatus } from "./status";
import { showRuntimeLogs } from "../../../runtime/stack/logs";
import { assertImageVersion } from "../../../runtime/stack/orchestration/images";
import { DEFAULT_STACK_VERSION } from "../../../runtime/stack/version";
import type { UlviaPaths } from "../../../runtime/paths";

export async function deploymentCommand(
    command: string,
    args: readonly string[],
    paths: UlviaPaths,
    environment: Record<string, string | undefined>,
    log: (line: string) => void,
): Promise<void> {
    const usage =
        command === "apply" || command === "upgrade"
            ? `Usage: ulvia ${command} [--version <version>]`
            : `Usage: ulvia ${command}`;
    if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
        log(
            command === "apply" || command === "upgrade"
                ? `${usage}\nBundled stack release: ${DEFAULT_STACK_VERSION}`
                : command === "logs"
                  ? "Usage: ulvia logs [--filter component=provider|edge|proxy|mongo] [--filter service=edge-N] [--filter level=error] [--follow]"
                  : usage,
        );
        return;
    }
    if (command === "logs") {
        await showRuntimeLogs(paths, args, log);
        return;
    }
    if (command === "apply" || command === "upgrade") {
        const version = parseDeploymentVersion(command, args);
        await applyInstallation(paths, environment, log, version, command);
        return;
    }
    if (args.length) {
        throw new Error(usage);
    }
    if (command === "start") {
        await startLocalServices(paths, log);
    } else if (command === "stop") {
        await stopLocalServices(paths);
        log("Installation stopped. Persistent data retained.");
    } else if (command === "status") {
        await showInstallationStatus(paths, log);
    } else {
        throw new Error("Unknown deployment command");
    }
}
export function parseDeploymentVersion(command: string, args: readonly string[]): string | undefined {
    if (!args.length) {
        return undefined;
    }
    if (args.length !== 2 || args[0] !== "--version" || !args[1]) {
        throw new Error(`Usage: ulvia ${command} [--version <version>]`);
    }
    assertImageVersion(args[1]);
    return args[1];
}
