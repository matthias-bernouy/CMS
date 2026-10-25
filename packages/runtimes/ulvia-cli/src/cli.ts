import { clientConfigDirectory, readClientConfig } from "./runtime/repository/config";
import { identityCommand } from "./commands/namespace/identity";
import { localCommand } from "./commands/local";
import { pruneCommand } from "./commands/prune";
import { releaseCommand } from "./commands/release";
import { remoteCommand } from "./commands/remote";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { ensureUlviaPaths, resolveUlviaPaths } from "./runtime/paths";
import { CLI_VERSION } from "./runtime/stack/version";
import { standaloneRepositoryCommand } from "./commands/local/repository";
import { namespaceCommand } from "./commands/namespace/command";

const HELP = `Ulvia CMS CLI

Usage:
  ulvia start [--version <version>]
  ulvia configure network [network options]
  ulvia services start [--version <version>]
  ulvia services <stop | status | logs>
  ulvia repository login <url> [--identity <name>]
  ulvia repository <start | stop | status | upgrade | configure> [options]
  ulvia identity <create | import | use | list | public-key> [options]
  ulvia namespace <claim | status | rotate | revoke> [options]
  ulvia instance create <name> [--label <label>] [--domain <domain>]
  ulvia instance <start | stop | status | credentials | logs> <name>
  ulvia instance list
  ulvia instance delete <name> --yes
  ulvia upgrade <kernel | provider | repository> --version <version>
  ulvia reset --yes
  ulvia release <resource-directory> [--recursive]
  ulvia push <publisher/id@version | all> [--repository <url>]
  ulvia pull <kind> <publisher/id@version> --repository <url>
  ulvia yank <kind> <publisher/id@version> --repository <url> --reason <text>
  ulvia restore <kind> <publisher/id@version> --repository <url>
  ulvia prune

Commands:
  start        Start shared services and every existing instance
  configure    Configure persistent network exposure and TLS before creating instances
  services     Manage the shared proxy, MongoDB, Repository, and Provider
  repository   Manage an independent Repository deployment
  identity     Manage persistent local signing identities
  namespace    Manage cryptographic Repository namespace ownership
  instance     Create and manage independent Kernel instances
  upgrade      Pull and install one exact official Docker image version
  reset        Delete all instances, services data, and repository releases after --yes
  release      Validate and store one resource or a recursive resource batch
  push         Publish one local release or all non-yanked local releases
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
  ULVIA_CONFIG_DIR          Absolute client configuration directory override
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
        log(CLI_VERSION);
        return;
    }
    if (
        ![
            ...LOCAL_COMMANDS,
            "repository",
            "namespace",
            "identity",
            "release",
            "push",
            "pull",
            "yank",
            "restore",
            "prune",
        ].includes(command)
    ) {
        throw new Error(`Unknown command: ${command}`);
    }
    const environment = { ...(options.environment ?? process.env) };
    environment.ULVIA_CONFIG_DIR = clientConfigDirectory(environment, options.home);
    const cwd = options.cwd ?? process.cwd();
    const paths = resolveUlviaPaths(environment, options.home);
    await ensureUlviaPaths(paths);
    if (command === "identity") {
        await identityCommand(args.slice(1), environment.ULVIA_CONFIG_DIR, cwd, log);
        return;
    }
    if (["namespace", "push", "pull", "yank", "restore"].includes(command)) {
        environment.ULVIA_REPOSITORY_URL =
            environment.ULVIA_REPOSITORY_URL?.trim() ||
            (await readClientConfig(environment.ULVIA_CONFIG_DIR)).repository?.url;
    }
    if (command === "namespace") {
        await namespaceCommand(args.slice(1), environment, log);
        return;
    }
    if (command === "repository") {
        await standaloneRepositoryCommand(args.slice(1), paths, log, environment);
        return;
    }
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

const LOCAL_COMMANDS = new Set(["start", "configure", "services", "instance", "upgrade", "reset"]);
