import type { UlviaPaths } from "../../runtime/paths";
import { assertImageVersion } from "../../runtime/stack/orchestration/images";
import { repositoryLifecycle } from "../../runtime/stack/repository/lifecycle";
import { clientConfigDirectory, readClientConfig, updateClientConfig } from "../../runtime/repository/config";
import { loginRepository } from "../../runtime/repository/connection";
import { repositoryDeploymentCommand, repositoryOptions } from "../namespace/deployment";

const HELP = `Usage:
  ulvia repository login <url> [--identity <name>]
  ulvia repository logout
  ulvia repository <start | stop | status>
  ulvia repository start [--version <version>] [--port <port>]
  ulvia repository upgrade --version <version>
  ulvia repository configure [--port <port>] [--tls <local | external | acme>] [--public-url <url>] [--acme-email <email>]

One default Repository deployment, with independent persistent data and image pins.
Login verifies and saves the Repository identity; writes are signed locally.
TLS can use an external reverse proxy or a dedicated ACME proxy on ports 80/443.
No Provider, Kernel or database is started. Upgrades require a published version.`;

export async function standaloneRepositoryCommand(
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
    environment: Record<string, string | undefined>,
): Promise<void> {
    if (!args.length || args.includes("--help") || args[0] === "help") {
        log(HELP);
        return;
    }
    const [action, ...rest] = args;
    const directory = clientConfigDirectory(environment);
    if (action === "login") {
        const values = repositoryOptions(rest.slice(1), ["--identity"]);
        if (!rest[0]) {
            throw new Error(HELP);
        }
        const id = await loginRepository(directory, rest[0], values.get("--identity"));
        log(
            `Repository connection saved: ${(await readClientConfig(directory)).repository!.url} (${id}). Writes use local owner keys.`,
        );
        return;
    }
    if (action === "logout" && !rest.length) {
        await updateClientConfig(directory, async (config) => {
            delete config.repository;
        });
        log("Repository connection removed. Local identities retained.");
        return;
    }
    if (action === "configure") {
        await repositoryDeploymentCommand(rest, paths, log);
        return;
    }
    if (!["start", "stop", "status", "upgrade"].includes(action!)) {
        throw new Error(HELP);
    }
    const values = repositoryOptions(rest, ["--version", "--port"]);
    const version = values.get("--version");
    const rawPort = values.get("--port");
    if (version) {
        assertImageVersion(version);
    }
    const port = rawPort === undefined ? undefined : Number(rawPort);
    if (port !== undefined && (!/^\d+$/u.test(rawPort!) || !Number.isSafeInteger(port) || port < 1 || port > 65535)) {
        throw new Error("Repository port must be an integer between 1 and 65535");
    }
    if (
        (action === "upgrade" && (!version || port !== undefined)) ||
        ((action === "stop" || action === "status") && rest.length)
    ) {
        throw new Error(HELP);
    }
    await repositoryLifecycle(paths, action as "start" | "stop" | "status" | "upgrade", { version, port }, log);
}
