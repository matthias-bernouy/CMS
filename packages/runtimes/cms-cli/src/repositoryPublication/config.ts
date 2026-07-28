import { resolve } from "node:path";
import { normalizeRepositoryCmsUrl } from "./candidate/managementUrl";

const DEFAULT_TIMEOUT_MS = 900_000;
const MAX_TIMEOUT_MS = 1_800_000;

export type RepositoryPublicationEnvironment = Readonly<Record<string, string | undefined>>;

export type RepositoryPublicationConfig = Readonly<{
    cmsUrl?: string;
    credentialLookupUrl?: string;
    dryRun: boolean;
    source: Readonly<{ type: "integration"; root: string }> | Readonly<{ type: "official" }>;
    timeoutMs: number;
}>;

export const REPOSITORY_PUBLICATION_HELP = `Usage:
  p9r repository publish <integration-root> [--dry-run]
      [--url=https://admin.example/cms]
      [--allow-insecure-http]
      [--timeout-ms=900000]

  p9r repository publish-official [--dry-run]
      [--url=https://admin.example/cms]
      [--allow-insecure-http]
      [--timeout-ms=900000]

Environment fallbacks:
  P9R_URL
  P9R_TOKEN or ~/.config/p9r/credentials.json (CMS Personal Access Token)
  P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP
  P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS

Generic publication requires one author verification bundle per declared version at:
  <integration-root>/verification/<version>.json

Each bundle must target the exact package digest, retain the platform cms-postgres
runner requirement, and declare at least one executable contract or conformance suite.`;

export function parseRepositoryPublicationConfig(
    args: readonly string[],
    environment: RepositoryPublicationEnvironment,
): RepositoryPublicationConfig | "help" {
    if (
        args[0] === "--help" ||
        args[0] === "-h" ||
        ((args[0] === "publish" || args[0] === "publish-official") && (args[1] === "--help" || args[1] === "-h"))
    ) {
        return "help";
    }
    const source = parseSource(args);
    const flags = parseFlags(args.slice(source.type === "official" ? 1 : 2));
    if (flags.help) {
        return "help";
    }
    const rawUrl = flags.url ?? environment.P9R_URL;
    const rawTimeout = flags.timeoutMs ?? environment.P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS;
    const allowInsecureHttp =
        flags.allowInsecureHttp ||
        parseBooleanEnvironment(
            environment.P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP,
            "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP",
        );
    if (!flags.dryRun && !rawUrl?.trim()) {
        throw new Error("Publishing requires a CMS URL (--url or P9R_URL)");
    }

    return Object.freeze({
        ...(rawUrl?.trim()
            ? {
                  cmsUrl: normalizeRepositoryCmsUrl(rawUrl, allowInsecureHttp),
                  credentialLookupUrl: legacyCredentialLookupUrl(rawUrl),
              }
            : {}),
        dryRun: flags.dryRun,
        source,
        timeoutMs: parseTimeout(rawTimeout),
    });
}

function legacyCredentialLookupUrl(raw: string): string {
    return raw.trim().replace(/\/+$/u, "");
}

function parseSource(args: readonly string[]): RepositoryPublicationConfig["source"] {
    if (args[0] === "publish-official") {
        return { type: "official" };
    }
    if (args[0] !== "publish") {
        throw new Error("Repository command must be publish or publish-official");
    }
    const root = args[1]?.trim();
    if (!root || root.startsWith("-")) {
        throw new Error("Repository publication requires an integration root");
    }
    return { type: "integration", root: resolve(root) };
}

type ParsedFlags = {
    allowInsecureHttp: boolean;
    dryRun: boolean;
    help: boolean;
    url?: string;
    timeoutMs?: string;
};

function parseFlags(args: readonly string[]): ParsedFlags {
    const parsed: ParsedFlags = { allowInsecureHttp: false, dryRun: false, help: false };
    const seen = new Set<string>();
    for (const argument of args) {
        const [name, value] = splitFlag(argument);
        if (seen.has(name)) {
            throw new Error(`Repository publication flag is duplicated: ${name}`);
        }
        seen.add(name);
        if (name === "--dry-run" && value === undefined) {
            parsed.dryRun = true;
        } else if (name === "--allow-insecure-http" && value === undefined) {
            parsed.allowInsecureHttp = true;
        } else if ((name === "--help" || name === "-h") && value === undefined) {
            parsed.help = true;
        } else if (name === "--url" && value !== undefined) {
            parsed.url = value;
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

function parseBooleanEnvironment(raw: string | undefined, name: string): boolean {
    if (raw === undefined || raw.trim() === "false") {
        return false;
    }
    if (raw.trim() === "true") {
        return true;
    }
    throw new Error(`${name} must be true or false when set`);
}
