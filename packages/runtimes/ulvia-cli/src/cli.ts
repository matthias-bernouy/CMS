import { devCommand } from "./commands/dev";
import { pullCommand } from "./commands/pull";
import { statusCommand } from "./commands/status";
import { LocalIntegrationRepository } from "./repository/local";
import { DEFAULT_REPOSITORY_URL, RemoteIntegrationRepository } from "./repository/remote";
import { ensureUlviaPaths, resolveUlviaPaths } from "./runtime/paths";

const HELP = `Ulvia local-first developer CLI

Usage:
  ulvia pull <integration> [--version <version> | --all-versions]
  ulvia pull --all
  ulvia status
  ulvia dev [status | credentials | stop]

Commands:
  pull       Store immutable integration packages in the local repository
  status     Show the persistent data directory and locally available packages
  dev        Run or inspect the persistent local development stack
  push       Disabled while the local workflow is under construction

Environment:
  ULVIA_DATA_DIR        Absolute persistent data directory override
  ULVIA_REPOSITORY_URL  Read-only remote repository used only by pull
`;

export type CliOptions = Readonly<{
    environment?: Record<string, string | undefined>;
    home?: string;
    log?: (message: string) => void;
    repositoryFetch?: typeof fetch;
}>;

export async function runCli(args: readonly string[], options: CliOptions = {}): Promise<void> {
    const log = options.log ?? console.log;
    const command = args[0];
    if (!command || command === "help" || command === "--help" || command === "-h") {
        log(HELP.trimEnd());
        return;
    }
    if (command === "--version" || command === "-v") {
        log("0.1.0");
        return;
    }
    if (command === "push") {
        throw new Error("push is disabled: this milestone never writes to a remote repository");
    }
    if (command === "release") {
        throw new Error("release is not available yet; the local verification pipeline is the next milestone");
    }

    const environment = options.environment ?? process.env;
    const paths = resolveUlviaPaths(environment, options.home);
    await ensureUlviaPaths(paths);
    const local = new LocalIntegrationRepository(paths.repository, paths.packages);
    await local.init();
    if (command === "status") {
        assertNoArguments(command, args.slice(1));
        await statusCommand(paths, local, log);
        return;
    }
    if (command === "pull") {
        const remote = new RemoteIntegrationRepository(repositoryUrl(environment), options.repositoryFetch);
        await pullCommand(args.slice(1), local, remote, log);
        return;
    }
    if (command === "dev") {
        await devCommand(args.slice(1), paths, local, log);
        return;
    }
    throw new Error(`Unknown command: ${command}`);
}

function repositoryUrl(environment: Record<string, string | undefined>): string {
    const raw = environment.ULVIA_REPOSITORY_URL?.trim() || DEFAULT_REPOSITORY_URL;
    const parsed = new URL(raw);
    if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error("ULVIA_REPOSITORY_URL must be an HTTP URL without credentials, query, or fragment");
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
    return parsed.href.replace(/\/$/u, "");
}

function assertNoArguments(command: string, args: readonly string[]): void {
    if (args.length) {
        throw new Error(`${command} does not accept arguments`);
    }
}
