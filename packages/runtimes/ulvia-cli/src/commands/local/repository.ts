import type { UlviaPaths } from "../../runtime/paths";
import { assertImageVersion } from "../../runtime/stack/orchestration/images";
import { repositoryLifecycle } from "../../runtime/stack/repository/lifecycle";

const HELP = `Usage: ulvia repository <start | stop | status | upgrade> <name> [--version <version>] [--port <port>]

Manage an independent Repository container with its own persistent volume.
The management endpoint binds to loopback. Put a TLS reverse proxy in front
of a public deployment. Start defaults to port 5010; upgrades require a version.
This command does not start a Provider, Kernel, MongoDB, or shared proxy.`;

export async function standaloneRepositoryCommand(
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
): Promise<void> {
    if (!args.length || args.includes("--help") || args[0] === "help") {
        log(HELP);
        return;
    }
    const [action, name, ...rest] = args;
    if (!["start", "stop", "status", "upgrade"].includes(action!) || !name || rest.length % 2) {
        throw new Error(HELP);
    }
    const values = new Map<string, string>();
    for (let index = 0; index < rest.length; index += 2) {
        const key = rest[index]!;
        const value = rest[index + 1]!;
        if ((key !== "--version" && key !== "--port") || values.has(key) || !value) {
            throw new Error(HELP);
        }
        values.set(key, value);
    }
    const version = values.get("--version");
    const rawPort = values.get("--port");
    if (version) {
        assertImageVersion(version);
    }
    const port = rawPort === undefined ? undefined : Number(rawPort);
    if (port !== undefined && (!/^\d+$/u.test(rawPort!) || !Number.isSafeInteger(port) || port < 1 || port > 65_535)) {
        throw new Error("Repository port must be an integer between 1 and 65535");
    }
    if (
        (action === "upgrade" && (!version || port !== undefined)) ||
        ((action === "stop" || action === "status") && rest.length)
    ) {
        throw new Error(HELP);
    }
    await repositoryLifecycle(paths, name, action as "start" | "stop" | "status" | "upgrade", { version, port }, log);
}
