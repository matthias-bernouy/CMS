import { devCommand } from "./commands/dev";
import { pruneCommand } from "./commands/prune";
import { releaseCommand } from "./commands/release";
import { remoteCommand } from "./commands/remote";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { ensureUlviaPaths } from "./runtime/paths";
import { createProjectEnvironment, resolveCommandPaths } from "./runtime/dev/projectEnvironment";

const HELP = `Ulvia local CMS CLI

Usage:
  ulvia dev [status | credentials | stop]
  ulvia dev logs [all | kernel | provider | repository | supervisor] [filters] [--json] [--stack] [--follow]
  ulvia dev new [--data-dir <absolute-data-directory>]
  ulvia dev reset --yes
  ulvia release <resource-directory>
  ulvia push <kind> <publisher/id@version> --repository <url>
  ulvia pull <kind> <publisher/id@version> --repository <url>
  ulvia yank <kind> <publisher/id@version> --repository <url> --reason <text>
  ulvia restore <kind> <publisher/id@version> --repository <url>
  ulvia prune

Commands:
  dev        Run, inspect, create, or reset a persistent local CMS development stack
  release    Validate and store an immutable collection, contract, or provider manifest
  push       Publish one exact local release to a remote repository
  pull       Validate and store one exact remote release locally
  yank       Hide a remote release from new catalogue resolutions
  restore    Make a yanked remote release resolvable again
  prune      Remove all local repository contents

Environment:
  ULVIA_DATA_DIR          Absolute persistent data directory override
  ULVIA_DEV_KERNEL_PORT   Local Kernel port
  ULVIA_DEV_MONGO_PORT    Local MongoDB port
  ULVIA_DEV_REPOSITORY_PORT Local collection repository port
  ULVIA_REPOSITORY_URL      Default remote repository URL
  ULVIA_REPOSITORY_TOKEN    Remote repository write token
  ULVIA_LOG_LEVEL           Runtime log threshold (trace through fatal)
  ULVIA_LOG_CONSOLE_LEVEL   Development terminal threshold (trace through fatal)
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
    if (!["dev", "release", "push", "pull", "yank", "restore", "prune"].includes(command)) {
        throw new Error(`Unknown command: ${command}`);
    }
    const environment = options.environment ?? process.env;
    const cwd = options.cwd ?? process.cwd();
    if (command === "dev" && args[1] === "new") {
        const dataDirectory = parseNewDataDirectory(args.slice(2));
        const created = await createProjectEnvironment(cwd, environment, options.home, dataDirectory);
        log(`Created Ulvia environment for ${created.projectRoot}`);
        log(`Persistent data: ${created.paths.data}`);
        await devCommand([], created.paths, log, environment);
        return;
    }
    const paths = await resolveCommandPaths(cwd, environment, options.home);
    await ensureUlviaPaths(paths);
    if (command === "dev") {
        await devCommand(args.slice(1), paths, log, environment);
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

function parseNewDataDirectory(args: readonly string[]): string | undefined {
    if (args.length === 0) {
        return undefined;
    }
    if (args.length === 2 && args[0] === "--data-dir" && args[1]) {
        return args[1];
    }
    throw new Error("Usage: ulvia dev new [--data-dir <absolute-data-directory>]");
}
