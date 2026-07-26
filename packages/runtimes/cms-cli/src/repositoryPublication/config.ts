import { isAbsolute, resolve } from "node:path";

const DEFAULT_TIMEOUT_MS = 900_000;
const MAX_TIMEOUT_MS = 1_800_000;

export type RepositoryPublicationEnvironment = Readonly<Record<string, string | undefined>>;

export type RepositoryPublicationConfig = Readonly<{
    dryRun: boolean;
    managementUrl?: string;
    tokenFile?: string;
    timeoutMs: number;
}>;

export const REPOSITORY_PUBLICATION_HELP = `Usage:
  p9r repository publish-official [--dry-run]
      [--url=https://management.example/.cms/repository-management]
      [--token-file=/absolute/path/to/token]
      [--timeout-ms=900000]

Environment fallbacks:
  P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL
  P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE
  P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS`;

export function parseRepositoryPublicationConfig(
    args: readonly string[],
    environment: RepositoryPublicationEnvironment,
): RepositoryPublicationConfig | "help" {
    if (args[0] === "--help" || args[0] === "-h") {
        return "help";
    }
    if (args[0] !== "publish-official") {
        throw new Error("Repository command must be publish-official");
    }

    const flags = parseFlags(args.slice(1));
    if (flags.help) {
        return "help";
    }
    const rawUrl = flags.url ?? environment.P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL;
    const rawTokenFile = flags.tokenFile ?? environment.P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE;
    const rawTimeout = flags.timeoutMs ?? environment.P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS;
    if (!flags.dryRun && (!rawUrl?.trim() || !rawTokenFile?.trim())) {
        throw new Error("Publishing requires a management URL and token file");
    }

    return Object.freeze({
        dryRun: flags.dryRun,
        ...(rawUrl?.trim() ? { managementUrl: normalizeManagementUrl(rawUrl) } : {}),
        ...(rawTokenFile?.trim() ? { tokenFile: normalizeTokenFile(rawTokenFile) } : {}),
        timeoutMs: parseTimeout(rawTimeout),
    });
}

type ParsedFlags = {
    dryRun: boolean;
    help: boolean;
    url?: string;
    tokenFile?: string;
    timeoutMs?: string;
};

function parseFlags(args: readonly string[]): ParsedFlags {
    const parsed: ParsedFlags = { dryRun: false, help: false };
    const seen = new Set<string>();
    for (const argument of args) {
        const [name, value] = splitFlag(argument);
        if (seen.has(name)) {
            throw new Error(`Repository publication flag is duplicated: ${name}`);
        }
        seen.add(name);
        if (name === "--dry-run" && value === undefined) {
            parsed.dryRun = true;
        } else if ((name === "--help" || name === "-h") && value === undefined) {
            parsed.help = true;
        } else if (name === "--url" && value !== undefined) {
            parsed.url = value;
        } else if (name === "--token-file" && value !== undefined) {
            parsed.tokenFile = value;
        } else if (name === "--timeout-ms" && value !== undefined) {
            parsed.timeoutMs = value;
        } else {
            throw new Error("Unknown repository publication flag");
        }
    }
    return parsed;
}

function splitFlag(argument: string): readonly [string, string | undefined] {
    const separator = argument.indexOf("=");
    return separator < 0 ? [argument, undefined] : [argument.slice(0, separator), argument.slice(separator + 1)];
}

function normalizeManagementUrl(raw: string): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error("Repository management URL must be an absolute HTTP(S) URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Repository management URL must be an absolute HTTP(S) URL");
    }
    if (url.username || url.password || url.search || url.hash || raw.includes("?") || raw.includes("#")) {
        throw new Error("Repository management URL must not contain credentials, query, or fragment");
    }
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.href.replace(/\/$/u, "");
}

function normalizeTokenFile(raw: string): string {
    const path = raw.trim();
    if (!isAbsolute(path)) {
        throw new Error("Repository management token file must be an absolute path");
    }
    return resolve(path);
}

function parseTimeout(raw: string | undefined): number {
    if (raw === undefined) {
        return DEFAULT_TIMEOUT_MS;
    }
    if (!/^[0-9]+$/u.test(raw)) {
        throw new Error(`Repository publication timeout must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
        throw new Error(`Repository publication timeout must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
    }
    return value;
}
