import { parseCspPolicy } from "./cspPolicy";
import type { CspExtras } from "@bernouy/http-runner";
import { parseHttpUrl, parsePort, requiredEnv, type RuntimeEnvSource } from "./runtimeEnvParsing";
import { assertProviderInvocationSecret } from "@bernouy/cms-gateway/protocol";

export { parsePort } from "./runtimeEnvParsing";

export type RuntimeEnv = {
    MODE: "DEV" | "PROD";
    CMS_EDGE_RESPONSE_CACHE?: boolean;
    CMS_CSP_ALLOWED_ORIGINS: CspExtras;
    CMS_PORT: number;
    CMS_HOST: string;
    CMS_HOSTING_PROVIDER_URL: string;
    CMS_HOSTING_EDGE_SECRET: string;
    CMS_EDGE_MAX_CONTEXTS: number;
};

export function readRuntimeEnv(source: RuntimeEnvSource): RuntimeEnv {
    const MODE = parseRuntimeMode(source.MODE);
    const CMS_PORT = parsePort(source.CMS_PORT, "CMS_PORT", 3000);
    if (source.CMS_PUBLIC_URL || source.CMS_INSTALLATIONS_PROVIDER_TOKEN || source.CMS_INSTALLATIONS_PROVIDER_URL) {
        throw new Error("Single-instance Edge configuration is incompatible; configure shared hosting instead");
    }
    const providerConfiguration = parseUlviaProviderConfig(source);

    return {
        MODE,
        CMS_EDGE_RESPONSE_CACHE: parseCacheEnabled(source.CMS_EDGE_RESPONSE_CACHE, MODE),
        CMS_CSP_ALLOWED_ORIGINS: parseCspPolicy(source.CMS_CSP_ALLOWED_ORIGINS),
        CMS_PORT,
        CMS_HOST: parseListenerHost(source.CMS_HOST, "CMS_HOST"),
        ...providerConfiguration,
        CMS_EDGE_MAX_CONTEXTS: parseContextCount(source.CMS_EDGE_MAX_CONTEXTS),
    };
}

function parseRuntimeMode(raw: string | undefined): RuntimeEnv["MODE"] {
    const mode = raw?.trim() || "PROD";
    if (mode !== "DEV" && mode !== "PROD") {
        throw new Error("MODE must be DEV or PROD");
    }
    return mode;
}

function parseListenerHost(raw: string | undefined, name: string): string {
    const value = raw?.trim() || "0.0.0.0";
    if (value.length > 253 || /[\s/\\?#@\[\]]/u.test(value)) {
        throw new Error(`${name} must be a hostname or IP address without a port`);
    }
    try {
        new URL(`http://${value.includes(":") ? `[${value}]` : value}/`);
    } catch {
        throw new Error(`${name} must be a hostname or IP address without a port`);
    }
    return value;
}

function parseUlviaProviderConfig(
    source: RuntimeEnvSource,
): Pick<RuntimeEnv, "CMS_HOSTING_PROVIDER_URL" | "CMS_HOSTING_EDGE_SECRET"> {
    const token = requiredEnv(source, "CMS_HOSTING_EDGE_SECRET");
    if (token !== source.CMS_HOSTING_EDGE_SECRET) {
        throw new Error("CMS_HOSTING_EDGE_SECRET is invalid");
    }
    assertProviderInvocationSecret(token);
    const endpoint = new URL(parseHttpUrl(requiredEnv(source, "CMS_HOSTING_PROVIDER_URL"), "CMS_HOSTING_PROVIDER_URL"));
    if (endpoint.pathname !== "/" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error("CMS_HOSTING_PROVIDER_URL must be an HTTP origin");
    }
    return { CMS_HOSTING_PROVIDER_URL: endpoint.origin, CMS_HOSTING_EDGE_SECRET: token };
}
function parseContextCount(raw: string | undefined): number {
    if (raw === undefined) {
        return 16;
    }
    if (!/^[0-9]+$/u.test(raw) || Number(raw) < 1 || Number(raw) > 128) {
        throw new Error("CMS_EDGE_MAX_CONTEXTS must be between 1 and 128");
    }
    return Number(raw);
}

function parseCacheEnabled(raw: string | undefined, mode: RuntimeEnv["MODE"]): boolean {
    if (raw === undefined) {
        return mode !== "DEV";
    }
    if (raw !== "true" && raw !== "false") {
        throw new Error("CMS_EDGE_RESPONSE_CACHE must be true or false");
    }
    return raw === "true";
}
