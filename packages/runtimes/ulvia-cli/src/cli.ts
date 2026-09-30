import { devCommand } from "./commands/dev";
import { pruneCommand } from "./commands/prune";
import { releaseCommand } from "./commands/release";
import { LocalCollectionRepository } from "./repository/local";
import { ensureUlviaPaths, resolveUlviaPaths } from "./runtime/paths";

const HELP = `Ulvia local CMS CLI

Usage:
  ulvia dev [status | credentials | stop]
  ulvia release <resource-directory>
  ulvia prune

Commands:
  dev        Run or inspect the persistent local CMS development stack
  release    Validate and store an immutable collection, contract, or provider manifest
  prune      Remove all local repository contents

Environment:
  ULVIA_DATA_DIR          Absolute persistent data directory override
  ULVIA_DEV_CONTROL_PORT  Local Control port
  ULVIA_DEV_DELIVERY_PORT Local Delivery port
  ULVIA_DEV_MONGO_PORT    Local MongoDB port
  ULVIA_DEV_REPOSITORY_PORT Local collection repository port
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
    if (command !== "dev" && command !== "release" && command !== "prune") {
        throw new Error(`Unknown command: ${command}`);
    }
    const environment = options.environment ?? process.env;
    const paths = resolveUlviaPaths(environment, options.home);
    await ensureUlviaPaths(paths);
    if (command === "dev") {
        await devCommand(args.slice(1), paths, log, environment);
        return;
    }
    const repository = new LocalCollectionRepository(paths.repository);
    if (command === "release") {
        await releaseCommand(args.slice(1), options.cwd ?? process.cwd(), paths.repository, log);
        return;
    }
    await pruneCommand(args.slice(1), repository, log);
}
