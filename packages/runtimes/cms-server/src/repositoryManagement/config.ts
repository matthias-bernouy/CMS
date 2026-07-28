import { isAbsolute, resolve } from "node:path";
import type { RuntimeEnvSource } from "../runtimeEnvParsing";

const MANAGEMENT_URL_ENV = "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL";
const MANAGEMENT_TOKEN_FILE_ENV = "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE";
const MANAGEMENT_ADMIN_ENV = "P9R_INTEGRATION_REPOSITORY_ADMIN_SUBJECT_IDENTIFIER";
const MANAGEMENT_TIMEOUT_ENV = "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TIMEOUT_MS";
const DEFAULT_MANAGEMENT_TIMEOUT_MS = 60_000;
const MAX_MANAGEMENT_TIMEOUT_MS = 120_000;

export type RepositoryManagementGatewayConfig = Readonly<{
    url: string;
    tokenFile: string;
    administratorSubjectIdentifier: string;
    timeoutMs: number;
}>;

export function parseRepositoryManagementGatewayConfig(
    source: RuntimeEnvSource,
): RepositoryManagementGatewayConfig | undefined {
    const configuredValues = [
        source[MANAGEMENT_URL_ENV],
        source[MANAGEMENT_TOKEN_FILE_ENV],
        source[MANAGEMENT_ADMIN_ENV],
        source[MANAGEMENT_TIMEOUT_ENV],
    ];
    if (configuredValues.every((value) => value === undefined)) {
        return undefined;
    }

    return Object.freeze({
        url: parseManagementUrl(requiredConfigurationValue(source, MANAGEMENT_URL_ENV)),
        tokenFile: parseAbsolutePath(requiredConfigurationValue(source, MANAGEMENT_TOKEN_FILE_ENV)),
        administratorSubjectIdentifier: requiredConfigurationValue(source, MANAGEMENT_ADMIN_ENV),
        timeoutMs: parseTimeout(source[MANAGEMENT_TIMEOUT_ENV]),
    });
}

function requiredConfigurationValue(source: RuntimeEnvSource, name: string): string {
    const value = source[name]?.trim();
    if (!value) {
        throw new Error(`Repository management requires non-empty ${name}`);
    }
    return value;
}

function parseManagementUrl(raw: string): string {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error(`${MANAGEMENT_URL_ENV} must be an absolute HTTP(S) URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`${MANAGEMENT_URL_ENV} must be an absolute HTTP(S) URL`);
    }
    if (url.username || url.password) {
        throw new Error(`${MANAGEMENT_URL_ENV} must not contain credentials`);
    }
    if (url.search || url.hash || raw.includes("?") || raw.includes("#")) {
        throw new Error(`${MANAGEMENT_URL_ENV} must not contain a query or fragment`);
    }

    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.href.replace(/\/$/u, "");
}

function parseAbsolutePath(raw: string): string {
    if (!isAbsolute(raw)) {
        throw new Error(`${MANAGEMENT_TOKEN_FILE_ENV} must be an absolute path`);
    }
    return resolve(raw);
}

function parseTimeout(raw: string | undefined): number {
    if (raw === undefined) {
        return DEFAULT_MANAGEMENT_TIMEOUT_MS;
    }
    if (!/^[0-9]+$/u.test(raw)) {
        throw new Error(`${MANAGEMENT_TIMEOUT_ENV} must be an integer between 1 and ${MAX_MANAGEMENT_TIMEOUT_MS}`);
    }
    const timeout = Number(raw);
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > MAX_MANAGEMENT_TIMEOUT_MS) {
        throw new Error(`${MANAGEMENT_TIMEOUT_ENV} must be an integer between 1 and ${MAX_MANAGEMENT_TIMEOUT_MS}`);
    }
    return timeout;
}
