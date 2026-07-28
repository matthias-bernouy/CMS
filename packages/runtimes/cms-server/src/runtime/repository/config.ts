import { isAbsolute, resolve } from "node:path";
import { REPOSITORY_MANAGEMENT_BASE_PATH } from "@bernouy/cms-repository-management";
import {
    parseBoolean,
    parseHttpUrl,
    parsePositiveInteger,
    requiredEnv,
    type RuntimeEnvSource,
} from "../../runtimeEnvParsing";

const ENABLED = "CMS_REPOSITORY_MANAGEMENT_GATEWAY_ENABLED";
const UPSTREAM_URL = "CMS_REPOSITORY_MANAGEMENT_UPSTREAM_URL";
const TOKEN_FILE = "CMS_REPOSITORY_MANAGEMENT_UPSTREAM_TOKEN_FILE";
const TIMEOUT = "CMS_REPOSITORY_MANAGEMENT_UPSTREAM_TIMEOUT_MS";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;

export type RepositoryManagementGatewayRuntimeConfig = Readonly<{
    url: string;
    tokenFile: string;
    timeoutMs: number;
}>;

export function parseRepositoryManagementGatewayConfig(
    source: RuntimeEnvSource,
): RepositoryManagementGatewayRuntimeConfig | undefined {
    const enabled = parseBoolean(source[ENABLED], ENABLED, false);
    const configured = [source[UPSTREAM_URL], source[TOKEN_FILE], source[TIMEOUT]].some((value) => value !== undefined);
    if (!enabled) {
        if (configured) {
            throw new Error(`Repository management upstream settings require ${ENABLED}=true`);
        }
        return undefined;
    }

    return Object.freeze({
        url: managementUrl(requiredEnv(source, UPSTREAM_URL)),
        tokenFile: tokenPath(requiredEnv(source, TOKEN_FILE)),
        timeoutMs: timeout(source[TIMEOUT]),
    });
}

function managementUrl(raw: string): string {
    const value = new URL(parseHttpUrl(raw, UPSTREAM_URL));
    if (value.username || value.password || value.search || value.hash || raw.includes("?") || raw.includes("#")) {
        throw new Error(`${UPSTREAM_URL} must not contain credentials, query, or fragment`);
    }
    value.pathname = value.pathname.replace(/\/+$/u, "") || "/";
    if (value.pathname !== REPOSITORY_MANAGEMENT_BASE_PATH) {
        throw new Error(`${UPSTREAM_URL} must end at ${REPOSITORY_MANAGEMENT_BASE_PATH}`);
    }
    return value.href.replace(/\/$/u, "");
}

function tokenPath(raw: string): string {
    if (!isAbsolute(raw)) {
        throw new Error(`${TOKEN_FILE} must be an absolute path`);
    }
    return resolve(raw);
}

function timeout(raw: string | undefined): number {
    const value = parsePositiveInteger(raw, TIMEOUT, DEFAULT_TIMEOUT_MS);
    if (value > MAX_TIMEOUT_MS) {
        throw new Error(`${TIMEOUT} must not exceed ${MAX_TIMEOUT_MS}`);
    }
    return value;
}
