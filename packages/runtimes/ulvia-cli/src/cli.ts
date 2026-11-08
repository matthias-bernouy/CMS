import { ensureUlviaPaths, resolveUlviaPaths } from "./runtime/paths";
import { CLI_VERSION } from "./runtime/stack/version";

const HELP = `Ulvia CMS CLI

Usage:
  ulvia start [--version <version>]
  ulvia configure network [network options]
  ulvia services start [--version <version>]
  ulvia services <stop | status | logs>
  ulvia repository login <url> [--token-stdin]
  ulvia repository logout
  ulvia namespace <list | claim | status | transfer | suspend> [options]
  ulvia instance create <name> [--label <label>] [--domain <domain>] [--profile <id@version>]
  ulvia instance <start | stop | status | credentials | logs> <name>
  ulvia instance upgrade-profile <name> <id@version>
  ulvia instance list
  ulvia instance delete <name> --yes
  ulvia upgrade <edge | provider> --version <version>
  ulvia reset --yes
  ulvia release <resource-directory> [--recursive]
  ulvia preview <collection-directory> --output <new-directory> [--dependency <directory>] [--no-screenshots] [--serve]
  ulvia push <publisher/id@version | all> [--repository <url>]
  ulvia pull <kind> <publisher/id@version> --repository <url>
  ulvia yank <kind> <publisher/id@version> --repository <url> --reason <text>
  ulvia restore <kind> <publisher/id@version> --repository <url>
  ulvia prune

Commands:
  start        Start shared services and every existing instance
  configure    Configure persistent network exposure and TLS before creating instances
  services     Manage the shared proxy, MongoDB, and Provider
  repository   Manage a pinned Repository PAT connection
  namespace    Manage account-owned Repository namespaces
  instance     Create and manage independent Edge instances
  upgrade      Pull and install one exact official Docker image version
  reset        Delete all instances, services data, and repository releases after --yes
  preview      Generate example frames, captures, and a local explorer
  release      Validate and store one resource or a recursive resource batch
  push         Publish one local release or all non-yanked local releases
  pull         Validate and store one exact remote release locally
  yank         Hide a remote release from new catalogue resolutions
  restore      Make a yanked remote release resolvable again
  prune        Remove all local repository contents

Environment:
  ULVIA_DATA_DIR            Absolute persistent data directory override
  ULVIA_HTTP_PORT           Initial HTTP proxy port (tests and isolated installations)
  ULVIA_PROVIDER_PORT       Initial Provider management port
  ULVIA_REPOSITORY_URL      Default remote repository URL
  ULVIA_REPOSITORY_TOKEN    PAT used only by repository login
  ULVIA_CONFIG_DIR          Absolute client configuration directory override
`;

export type CliOptions = Readonly<{
    environment?: Record<string, string | undefined>;
    home?: string;
    cwd?: string;
    log?: (message: string) => void;
    stdin?: ReadableStream<Uint8Array>;
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
            "release",
            "preview",
            "push",
            "pull",
            "yank",
            "restore",
            "prune",
        ].includes(command)
    ) {
        throw new Error(`Unknown command: ${command}`);
    }
    const { clientConfigDirectory, readClientConfig } = await import("./runtime/repository/config");
    const environment = { ...(options.environment ?? process.env) };
    environment.ULVIA_CONFIG_DIR = clientConfigDirectory(environment, options.home);
    const cwd = options.cwd ?? process.cwd();
    const paths = resolveUlviaPaths(environment, options.home);
    await ensureUlviaPaths(paths);
    if (["namespace", "push", "pull", "yank", "restore"].includes(command)) {
        environment.ULVIA_REPOSITORY_URL =
            environment.ULVIA_REPOSITORY_URL?.trim() ||
            (await readClientConfig(environment.ULVIA_CONFIG_DIR)).repository?.url;
    }
    if (command === "namespace") {
        const { namespaceCommand } = await import("./commands/namespace/command");
        await namespaceCommand(args.slice(1), environment, log);
        return;
    }
    if (command === "repository") {
        const { repositoryConnectionCommand } = await import("./commands/local/repository");
        await repositoryConnectionCommand(args.slice(1), log, environment, options.stdin);
        return;
    }
    if (LOCAL_COMMANDS.has(command)) {
        const { localCommand } = await import("./commands/local");
        await localCommand(command, args.slice(1), paths, log, environment);
        return;
    }
    if (command === "preview") {
        const { previewCommand } = await import("./preview/command");
        await previewCommand(args.slice(1), cwd, paths.repository, log);
        return;
    }
    if (command === "release") {
        const { releaseCommand } = await import("./commands/release");
        await releaseCommand(args.slice(1), cwd, paths.repository, log);
        return;
    }
    if (command === "push" || command === "pull" || command === "yank" || command === "restore") {
        const { remoteCommand } = await import("./commands/remote");
        await remoteCommand(command, args.slice(1), paths.repository, environment, log);
        return;
    }
    const { pruneCommand } = await import("./commands/prune");
    const { LocalCollectionRepository } = await import("@bernouy/repository/repository/filesystem");
    const repository = new LocalCollectionRepository(paths.repository);
    await pruneCommand(args.slice(1), repository, log);
}

const LOCAL_COMMANDS = new Set(["start", "configure", "services", "instance", "upgrade", "reset"]);
