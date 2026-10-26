import { parseHttpUrl, parseBoolean, parsePort, requiredEnv, type RuntimeEnvSource } from "./runtimeEnvParsing";
import { parseRuntimeKekConfig, type RuntimeKekConfig } from "./runtimeEnvKek";
import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";

export type ProviderRuntimeEnv = Readonly<{
    ULVIA_PROVIDER_PORT: number;
    ULVIA_PROVIDER_HOST: string;
    ULVIA_PROVIDER_PUBLIC_URL: string;
    ULVIA_PROVIDER_OPERATOR_TOKEN: string;
    CMS_REPOSITORY_URL: string;
    CMS_REPOSITORY_ALLOW_INSECURE_HTTP: boolean;
    MONGO_URL: string;
    CMS_FILES_DIR: string;
    CMS_SESSION_SECRET: string;
    CMS_KEK: RuntimeKekConfig;
}>;

export function readProviderRuntimeEnv(source: RuntimeEnvSource): ProviderRuntimeEnv {
    const ULVIA_PROVIDER_PORT = parsePort(source.ULVIA_PROVIDER_PORT, "ULVIA_PROVIDER_PORT", 5103);
    const ULVIA_PROVIDER_PUBLIC_URL = parseHttpUrl(
        requiredEnv(source, "ULVIA_PROVIDER_PUBLIC_URL"),
        "ULVIA_PROVIDER_PUBLIC_URL",
    );
    assertProviderOrigin(ULVIA_PROVIDER_PUBLIC_URL, ULVIA_PROVIDER_PORT);
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
        CMS_REPOSITORY_URL: parseHttpUrl(requiredEnv(source, "CMS_REPOSITORY_URL"), "CMS_REPOSITORY_URL"),
        CMS_REPOSITORY_ALLOW_INSECURE_HTTP: parseBoolean(
            source.CMS_REPOSITORY_ALLOW_INSECURE_HTTP,
            "CMS_REPOSITORY_ALLOW_INSECURE_HTTP",
            false,
        ),
        MONGO_URL: requiredEnv(source, "MONGO_URL"),
        CMS_FILES_DIR: requiredEnv(source, "CMS_FILES_DIR"),
        CMS_SESSION_SECRET: requiredEnv(source, "CMS_SESSION_SECRET"),
        CMS_KEK: parseRuntimeKekConfig(source),
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
