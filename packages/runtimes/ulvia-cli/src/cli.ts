import { devCommand } from "./commands/dev";
import { ensureUlviaPaths, resolveUlviaPaths } from "./runtime/paths";

const HELP = `Ulvia local CMS CLI

Usage:
  ulvia dev [status | credentials | stop]

Commands:
  dev        Run or inspect the persistent local CMS development stack

Environment:
  ULVIA_DATA_DIR          Absolute persistent data directory override
  ULVIA_DEV_CONTROL_PORT  Local Control port
  ULVIA_DEV_DELIVERY_PORT Local Delivery port
  ULVIA_DEV_MONGO_PORT    Local MongoDB port
`;

export type CliOptions = Readonly<{
    environment?: Record<string, string | undefined>;
    home?: string;
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
    if (command !== "dev") {
        throw new Error(`Unknown command: ${command}`);
    }
    const environment = options.environment ?? process.env;
    const paths = resolveUlviaPaths(environment, options.home);
    await ensureUlviaPaths(paths);
    await devCommand(args.slice(1), paths, log, environment);
}
