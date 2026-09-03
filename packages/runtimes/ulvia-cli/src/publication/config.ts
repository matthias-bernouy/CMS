import { isIP } from "node:net";
import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";

const MANAGEMENT_PATH = "/.cms/repository-management";
const DEFAULT_TIMEOUT_MS = 900_000;
const MAX_TIMEOUT_MS = 1_800_000;

export type PushFlags = Readonly<{
    kind?: string;
    version?: string;
    all: boolean;
    cmsUrl?: string;
    timeoutMs: number;
}>;

export function parsePushFlags(args: readonly string[], environment: Record<string, string | undefined>): PushFlags {
    let kind: string | undefined;
    let version: string | undefined;
    let all = false;
    let cmsUrl: string | undefined;
    let allowInsecureHttp = parseBoolean(environment.ULVIA_PUSH_ALLOW_INSECURE_HTTP, "ULVIA_PUSH_ALLOW_INSECURE_HTTP");
    let timeout = environment.ULVIA_PUSH_TIMEOUT_MS;
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index]!;
        if (!argument.startsWith("-")) {
            if (kind) {
                throw new Error("push accepts at most one integration name");
            }
            kind = integrationKind(argument);
            continue;
        }
        const [name, inline] = splitFlag(argument);
        if (seen.has(name)) {
            throw new Error(`Push option is duplicated: ${name}`);
        }
        seen.add(name);
        if (name === "--all" && inline === undefined) {
            all = true;
        } else if (name === "--allow-insecure-http" && inline === undefined) {
            allowInsecureHttp = true;
        } else if (name === "--version") {
            version = assertIntegrationPackageVersion(flagValue(name, inline, () => args[++index]));
        } else if (name === "--url") {
            cmsUrl = flagValue(name, inline, () => args[++index]);
        } else if (name === "--timeout-ms") {
            timeout = flagValue(name, inline, () => args[++index]);
        } else {
            throw new Error(`Unknown push option: ${name}`);
        }
    }
    if (all && (kind || version)) {
        throw new Error("--all cannot be combined with an integration name or version option");
    }
    if (!all && !kind) {
        throw new Error("push requires an integration name or --all");
    }
    if (version && !kind) {
        throw new Error("--version requires an integration name");
    }
    const rawUrl = cmsUrl ?? environment.ULVIA_URL;
    return {
        ...(kind ? { kind } : {}),
        ...(version ? { version } : {}),
        all,
        ...(rawUrl?.trim() ? { cmsUrl: normalizeCmsUrl(rawUrl, allowInsecureHttp) } : {}),
        timeoutMs: parseTimeout(timeout),
    };
}

export function repositoryManagementUrl(cmsUrl: string): string {
    const url = new URL(cmsUrl);
    url.pathname = `${url.pathname.replace(/\/+$/u, "")}${MANAGEMENT_PATH}`;
    return url.href;
}

function normalizeCmsUrl(raw: string, allowInsecureHttp: boolean): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error("Push CMS URL must be an absolute HTTP(S) URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Push CMS URL must be an absolute HTTP(S) URL");
    }
    if (url.username || url.password || url.search || url.hash || raw.includes("?") || raw.includes("#")) {
        throw new Error("Push CMS URL must not contain credentials, query, or fragment");
    }
    if (url.protocol === "http:" && !loopback(url.hostname) && !allowInsecureHttp) {
        throw new Error("Remote push CMS URLs must use HTTPS; allow insecure HTTP only on a trusted network");
    }
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.href.replace(/\/$/u, "");
}

function parseTimeout(raw: string | undefined): number {
    if (raw === undefined) {
        return DEFAULT_TIMEOUT_MS;
    }
    if (!/^[0-9]+$/u.test(raw)) {
        throw new Error(`Push timeout must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
        throw new Error(`Push timeout must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
    }
    return value;
}

function parseBoolean(raw: string | undefined, name: string): boolean {
    if (raw === undefined || raw.trim() === "false") {
        return false;
    }
    if (raw.trim() === "true") {
        return true;
    }
    throw new Error(`${name} must be true or false when set`);
}

function splitFlag(argument: string): readonly [string, string | undefined] {
    const separator = argument.indexOf("=");
    return separator < 0 ? [argument, undefined] : [argument.slice(0, separator), argument.slice(separator + 1)];
}

function flagValue(name: string, inline: string | undefined, next: () => string | undefined): string {
    const value = inline ?? next();
    if (!value || value.startsWith("-")) {
        throw new Error(`${name} requires a value`);
    }
    return value;
}

function integrationKind(value: string): string {
    return assertIntegrationPackageKind(value);
}

function loopback(value: string): boolean {
    const hostname = value
        .replace(/^\[|\]$/gu, "")
        .replace(/\.$/u, "")
        .toLowerCase();
    return hostname === "localhost" || hostname === "::1" || (isIP(hostname) === 4 && hostname.startsWith("127."));
}
