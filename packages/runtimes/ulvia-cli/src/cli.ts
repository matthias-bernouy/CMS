import { localCommand } from "./commands/local";
import { pruneCommand } from "./commands/prune";
import { releaseCommand } from "./commands/release";
import { remoteCommand } from "./commands/remote";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { ensureUlviaPaths, resolveUlviaPaths } from "./runtime/paths";

const HELP = `Ulvia CMS CLI

Usage:
  ulvia start
  ulvia configure network [network options]
  ulvia services <start | stop | status | upgrade | logs>
  ulvia instance create <name> [--label <label>] [--domain <domain>]
  ulvia instance <start | stop | status | upgrade | credentials | logs> <name>
  ulvia instance list
  ulvia instance delete <name> --yes
  ulvia reset --yes
  ulvia release <resource-directory>
  ulvia push <kind> <publisher/id@version> --repository <url>
  ulvia pull <kind> <publisher/id@version> --repository <url>
  ulvia yank <kind> <publisher/id@version> --repository <url> --reason <text>
  ulvia restore <kind> <publisher/id@version> --repository <url>
  ulvia prune

Commands:
  start        Start shared services and every existing instance
  configure    Configure persistent network exposure and TLS before creating instances
  services     Manage the shared proxy, MongoDB, Repository, and Provider
  instance     Create and manage independent Kernel instances
  reset        Delete all instances, services data, and repository releases after --yes
  release      Validate and store an immutable collection, contract, or provider manifest
  push         Publish one exact local release to a remote repository
  pull         Validate and store one exact remote release locally
  yank         Hide a remote release from new catalogue resolutions
  restore      Make a yanked remote release resolvable again
  prune        Remove all local repository contents

Environment:
  ULVIA_DATA_DIR            Absolute persistent data directory override
  ULVIA_HTTP_PORT           Initial HTTP proxy port (tests and isolated installations)
  ULVIA_REPOSITORY_PORT     Initial collection repository port
  ULVIA_PROVIDER_PORT       Initial Provider management port
  ULVIA_REPOSITORY_URL      Default remote repository URL
  ULVIA_REPOSITORY_TOKEN    Remote repository write token
  ULVIA_LOG_LEVEL           Runtime log threshold (trace through fatal)
  ULVIA_LOG_CONSOLE_LEVEL   Local terminal threshold (trace through fatal)
  ULVIA_LOG_FORMAT          Runtime terminal format (pretty or json)
`;

export type CliOptions = Readonly<{
    environment?: Record<string, string | undefined>;
    home?: string;
    cwd?: string;
    log?: (message: string) => void;
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
    if (![...LOCAL_COMMANDS, "release", "push", "pull", "yank", "restore", "prune"].includes(command)) {
        throw new Error(`Unknown command: ${command}`);
    }
    const environment = options.environment ?? process.env;
    const cwd = options.cwd ?? process.cwd();
    const paths = resolveUlviaPaths(environment, options.home);
    await ensureUlviaPaths(paths);
    if (LOCAL_COMMANDS.has(command)) {
        await localCommand(command, args.slice(1), paths, log, environment);
        return;
    }
    const repository = new LocalCollectionRepository(paths.repository);
    if (command === "release") {
        await releaseCommand(args.slice(1), cwd, paths.repository, log);
        return;
    }
    if (command === "push" || command === "pull" || command === "yank" || command === "restore") {
        await remoteCommand(command, args.slice(1), paths.repository, environment, log);
        return;
    }
    await pruneCommand(args.slice(1), repository, log);
}

const LOCAL_COMMANDS = new Set(["start", "configure", "services", "instance", "reset"]);
