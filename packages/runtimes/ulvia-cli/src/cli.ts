import { auditCommand } from "./commands/audit";
import { devCommand } from "./commands/dev";
import { pullCommand } from "./commands/pull";
import { pushCommand } from "./commands/push";
import { releaseCommand } from "./commands/release";
import { statusCommand } from "./commands/status";
import type { LocalReleaseVerifier } from "./release/types";
import { RuntimeLocalReleaseVerifier } from "./release/verification";
import { LocalIntegrationRepository } from "./repository/local";
import { DEFAULT_REPOSITORY_URL, RemoteIntegrationRepository } from "./repository/remote";
import { ensureUlviaPaths, resolveUlviaPaths } from "./runtime/paths";

const HELP = `Ulvia local-first developer CLI

Usage:
  ulvia pull <integration> [--version <version> | --all-versions]
  ulvia pull --all
  ulvia audit <integration> [--version <version>] [--root <directory>]
  ulvia audit --all [--root <directory>]
  ulvia release <integration> [--version <version>] [--root <directory>]
  ulvia release --all [--root <directory>]
  ulvia push <integration> [--version <version>] [--url <manager-cms-url>]
  ulvia push --all [--url <manager-cms-url>]
  ulvia status
  ulvia dev [status | credentials | stop]

Commands:
  pull       Store immutable integration packages in the local repository
  audit      Verify source compatibility, fresh installs, and every supported upgrade
  release    Build and verify changed packages in disposable local services
  push       Submit exact local releases to remote admission and verify public bytes
  status     Show the persistent data directory and locally available packages
  dev        Run or inspect the persistent local development stack

Environment:
  ULVIA_DATA_DIR        Absolute persistent data directory override
  ULVIA_DEV_*_PORT      Local Control, Delivery, repository, Supabase management, and Mongo ports
  ULVIA_REPOSITORY_URL  Public repository used only by explicit pull and push commands
  ULVIA_URL             Manager CMS URL used by push
  ULVIA_TOKEN           CMS Personal Access Token used by push
  ULVIA_PUSH_TIMEOUT_MS Remote admission timeout (default: 900000)
  ULVIA_PUSH_ALLOW_INSECURE_HTTP  Allow a non-loopback HTTP manager URL
`;

export type CliOptions = Readonly<{
    environment?: Record<string, string | undefined>;
    home?: string;
    log?: (message: string) => void;
    repositoryFetch?: typeof fetch;
    publicationFetch?: typeof fetch;
    publicationNow?: () => number;
    publicationWait?: (milliseconds: number) => Promise<void>;
    cwd?: string;
    releaseVerifier?: LocalReleaseVerifier;
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
    if (command === "push") {
        const remote = new RemoteIntegrationRepository(repositoryUrl(environment), options.repositoryFetch);
        await pushCommand(
            args.slice(1),
            local,
            remote,
            {
                environment,
                ...(options.publicationFetch ? { fetch: options.publicationFetch } : {}),
                ...(options.publicationNow ? { now: options.publicationNow } : {}),
                ...(options.publicationWait ? { wait: options.publicationWait } : {}),
            },
            log,
        );
        return;
    }
    if (command === "release") {
        await releaseCommand(
            args.slice(1),
            options.cwd ?? process.cwd(),
            local,
            options.releaseVerifier ?? new RuntimeLocalReleaseVerifier(log),
            log,
        );
        return;
    }
    if (command === "audit") {
        await auditCommand(
            args.slice(1),
            options.cwd ?? process.cwd(),
            local,
            options.releaseVerifier ?? new RuntimeLocalReleaseVerifier(log),
            log,
        );
        return;
    }
    if (command === "dev") {
        await devCommand(args.slice(1), paths, local, log, environment);
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
