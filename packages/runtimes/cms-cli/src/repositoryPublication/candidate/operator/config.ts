import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { normalizeRepositoryCmsUrl } from "../managementUrl";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;
const REASON_LIMIT = 4_096;

export type RepositoryOperatorEnvironment = Readonly<Record<string, string | undefined>>;

export type RepositoryOperatorConfig = Readonly<{
    cmsUrl: string;
    credentialLookupUrl: string;
    operation:
        | Readonly<{ type: "promote-stable"; kind: string; version: string; reason?: string }>
        | Readonly<{ type: "block"; kind: string; version: string; reason: string }>
        | Readonly<{ type: "reevaluate"; kind: string; version: string; reason: string }>;
    timeoutMs: number;
}>;

export const REPOSITORY_OPERATOR_HELP = `Usage:
  p9r repository promote-stable <kind> <version> [--reason=<text>] [--url=https://admin.example/cms]
      [--allow-insecure-http] [--timeout-ms=60000]

  p9r repository block <kind> <version> --reason=<text> [--url=https://admin.example/cms]
      [--allow-insecure-http] [--timeout-ms=60000]

  p9r repository reevaluate <kind> <version> --reason=<text> [--url=https://admin.example/cms]
      [--allow-insecure-http] [--timeout-ms=60000]

Environment fallbacks:
  P9R_URL
  P9R_TOKEN or ~/.config/p9r/credentials.json (CMS Personal Access Token)
  P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP
  P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS`;

export function parseRepositoryOperatorConfig(
    args: readonly string[],
    environment: RepositoryOperatorEnvironment,
): RepositoryOperatorConfig | "help" {
    if (args[0] === "--help" || args[0] === "-h") {
        return "help";
    }
    const operation = operationName(args[0]);
    if (args[1] === "--help" || args[1] === "-h") {
        return "help";
    }
    const kind = requiredTarget(args[1], "kind");
    const version = requiredTarget(args[2], "version");
    assertTarget(kind, version);
    const flags = parseFlags(args.slice(3));
    if (flags.help) {
        return "help";
    }
    const reason = canonicalReason(flags.reason, operation !== "promote-stable");
    const rawUrl = flags.url ?? environment.P9R_URL;
    if (!rawUrl?.trim()) {
        throw new Error("Repository operation requires a CMS URL (--url or P9R_URL)");
    }
    const allowInsecureHttp =
        flags.allowInsecureHttp ||
        parseBooleanEnvironment(
            environment.P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP,
            "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_ALLOW_INSECURE_HTTP",
        );
    const cmsUrl = normalizeRepositoryCmsUrl(rawUrl, allowInsecureHttp);
    return Object.freeze({
        cmsUrl,
        credentialLookupUrl: rawUrl.trim().replace(/\/+$/u, ""),
        operation:
            operation === "promote-stable"
                ? { type: operation, kind, version, ...(reason ? { reason } : {}) }
                : { type: operation, kind, version, reason: reason! },
        timeoutMs: parseTimeout(flags.timeoutMs ?? environment.P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS),
    });
}

type OperationName = RepositoryOperatorConfig["operation"]["type"];
type ParsedFlags = {
    allowInsecureHttp: boolean;
    help: boolean;
    reason?: string;
    timeoutMs?: string;
    url?: string;
};

function operationName(value: string | undefined): OperationName {
    if (value === "promote-stable" || value === "block" || value === "reevaluate") {
        return value;
    }
    throw new Error("Repository operation must be promote-stable, block, or reevaluate");
}

function requiredTarget(value: string | undefined, label: string): string {
    if (!value || value.startsWith("-")) {
        throw new Error(`Repository operation requires an integration ${label}`);
    }
    return value;
}

function assertTarget(kind: string, version: string): void {
    try {
        assertIntegrationPackageKind(kind);
        assertIntegrationPackageVersion(version);
    } catch {
        throw new Error("Repository operation integration kind or version is invalid");
    }
}

function canonicalReason(value: string | undefined, required: boolean): string | undefined {
    if (value === undefined) {
        if (required) {
            throw new Error("Repository block and reevaluate operations require --reason=<text>");
        }
        return undefined;
    }
    if (!value || value.trim() !== value || value.length > REASON_LIMIT) {
        throw new Error(`Repository operation reason must be canonical text of at most ${REASON_LIMIT} characters`);
    }
    return value;
}

function parseFlags(args: readonly string[]): ParsedFlags {
    const parsed: ParsedFlags = { allowInsecureHttp: false, help: false };
    const seen = new Set<string>();
    for (const argument of args) {
        const [name, value] = splitFlag(argument);
        if (seen.has(name)) {
            throw new Error(`Repository operation flag is duplicated: ${name}`);
        }
        seen.add(name);
        if (name === "--allow-insecure-http" && value === undefined) {
            parsed.allowInsecureHttp = true;
        } else if ((name === "--help" || name === "-h") && value === undefined) {
            parsed.help = true;
        } else if (name === "--reason" && value !== undefined) {
            parsed.reason = value;
        } else if (name === "--timeout-ms" && value !== undefined) {
            parsed.timeoutMs = value;
        } else if (name === "--url" && value !== undefined) {
            parsed.url = value;
        } else {
            throw new Error("Unknown repository operation flag");
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
        throw timeoutError();
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
        throw timeoutError();
    }
    return value;
}

function timeoutError(): Error {
    return new Error(`Repository operation timeout must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
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
