import { parseHttpUrl, parsePort, requiredEnv, type RuntimeEnvSource } from "./runtimeEnvParsing";
import { parseRuntimeKekConfig, type RuntimeKekConfig } from "./runtimeEnvKek";
import { assertProviderConnectionToken } from "@bernouy/ulvia-providers/installations";
import { isAbsolute } from "node:path";

export type ProviderRuntimeEnv = Readonly<{
    ULVIA_PROVIDER_PORT: number;
    ULVIA_PROVIDER_HOST: string;
    ULVIA_PROVIDER_PUBLIC_URL: string;
    ULVIA_PROVIDER_OPERATOR_TOKEN: string;
    MONGO_URL: string;
    CMS_FILES_DIR: string;
    CMS_SESSION_SECRET: string;
    CMS_KEK: RuntimeKekConfig;
    ULVIA_EMBEDDING_MODEL_DIR?: string;
    ULVIA_BOOTSTRAP_DIR?: string;
}>;

export function readProviderRuntimeEnv(source: RuntimeEnvSource): ProviderRuntimeEnv {
    const ULVIA_PROVIDER_PORT = parsePort(source.ULVIA_PROVIDER_PORT, "ULVIA_PROVIDER_PORT", 5103);
    const ULVIA_PROVIDER_PUBLIC_URL = parseHttpUrl(
        requiredEnv(source, "ULVIA_PROVIDER_PUBLIC_URL"),
        "ULVIA_PROVIDER_PUBLIC_URL",
    );
    assertProviderOrigin(ULVIA_PROVIDER_PUBLIC_URL, ULVIA_PROVIDER_PORT);
    const modelDirectory = source.ULVIA_EMBEDDING_MODEL_DIR?.trim();
    if (modelDirectory && !isAbsolute(modelDirectory)) {
        throw new Error("ULVIA_EMBEDDING_MODEL_DIR must be an absolute path");
    }
    const bootstrapDirectory = source.ULVIA_BOOTSTRAP_DIR?.trim();
    if (bootstrapDirectory && !isAbsolute(bootstrapDirectory)) {
        throw new Error("ULVIA_BOOTSTRAP_DIR must be an absolute path");
    }
    const token = source.ULVIA_PROVIDER_OPERATOR_TOKEN;
    requiredEnv(source, "ULVIA_PROVIDER_OPERATOR_TOKEN");
    try {
        if (token !== token?.trim()) {
            throw new TypeError("token whitespace");
        }
        assertProviderConnectionToken(token!);
    } catch {
        throw new Error("ULVIA_PROVIDER_OPERATOR_TOKEN is invalid");
    }
    return {
        ULVIA_PROVIDER_PORT,
        ULVIA_PROVIDER_HOST: parseListenerHost(source.ULVIA_PROVIDER_HOST),
        ULVIA_PROVIDER_PUBLIC_URL,
        ULVIA_PROVIDER_OPERATOR_TOKEN: token!,
        MONGO_URL: requiredEnv(source, "MONGO_URL"),
        CMS_FILES_DIR: requiredEnv(source, "CMS_FILES_DIR"),
        CMS_SESSION_SECRET: requiredEnv(source, "CMS_SESSION_SECRET"),
        CMS_KEK: parseRuntimeKekConfig(source),
        ...(modelDirectory ? { ULVIA_EMBEDDING_MODEL_DIR: modelDirectory } : {}),
        ...(bootstrapDirectory ? { ULVIA_BOOTSTRAP_DIR: bootstrapDirectory } : {}),
    };
}

function assertProviderOrigin(origin: string, port: number): void {
    const endpoint = new URL(origin);
    const actualPort = Number(endpoint.port || (endpoint.protocol === "https:" ? "443" : "80"));
    if (actualPort !== port || endpoint.pathname !== "/") {
        throw new Error("ULVIA_PROVIDER_PUBLIC_URL must identify the configured ULVIA_PROVIDER_PORT root");
    }
}

function parseListenerHost(raw: string | undefined): string {
    const value = raw?.trim() || "0.0.0.0";
    if (value.length > 253 || /[\s/\\?#@\[\]]/u.test(value)) {
        throw new Error("ULVIA_PROVIDER_HOST must be a hostname or IP address without a port");
    }
    try {
        new URL(`http://${value.includes(":") ? `[${value}]` : value}/`);
    } catch {
        throw new Error("ULVIA_PROVIDER_HOST must be a hostname or IP address without a port");
    }
    return value;
}
