import {
    parseHttpUrl,
    parseNonNegativeInteger,
    parsePort,
    requiredEnv,
    type RuntimeEnvSource,
} from "./runtimeEnvParsing";
import { parseRuntimeKekConfig, type RuntimeKekConfig } from "./runtimeEnvKek";
import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";
import { parseSelectionSiteId } from "@bernouy/cms-repository/providers/selections";

export type ProviderRuntimeEnv = Readonly<{
    ULVIA_PROVIDER_PORT: number;
    ULVIA_PROVIDER_HOST: string;
    ULVIA_PROVIDER_PUBLIC_URL: string;
    ULVIA_PROVIDER_TOKEN: string;
    CMS_REPOSITORY_URL: string;
    CMS_GATEWAY_SITE_ID: string;
    MONGO_URL: string;
    CMS_FILES_DIR: string;
    CMS_SESSION_SECRET: string;
    CMS_KEK: RuntimeKekConfig;
    CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: number;
    CMS_ADMIN_EMAIL: string;
    KERNEL_PUBLIC_URL: string;
}>;

export function readProviderRuntimeEnv(source: RuntimeEnvSource): ProviderRuntimeEnv {
    const ULVIA_PROVIDER_PORT = parsePort(source.ULVIA_PROVIDER_PORT, "ULVIA_PROVIDER_PORT", 5103);
    const ULVIA_PROVIDER_PUBLIC_URL = parseHttpUrl(
        requiredEnv(source, "ULVIA_PROVIDER_PUBLIC_URL"),
        "ULVIA_PROVIDER_PUBLIC_URL",
    );
    assertProviderOrigin(ULVIA_PROVIDER_PUBLIC_URL, ULVIA_PROVIDER_PORT);
    const token = requiredEnv(source, "ULVIA_PROVIDER_TOKEN");
    try {
        assertProviderConnectionToken(token);
    } catch {
        throw new Error("ULVIA_PROVIDER_TOKEN is invalid");
    }
    const migrationRetention = parseNonNegativeInteger(
        source.CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION,
        "CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION",
        100,
    );
    if (migrationRetention > 10_000) {
        throw new Error("CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION must be at most 10000");
    }
    return {
        ULVIA_PROVIDER_PORT,
        ULVIA_PROVIDER_HOST: parseListenerHost(source.ULVIA_PROVIDER_HOST),
        ULVIA_PROVIDER_PUBLIC_URL,
        ULVIA_PROVIDER_TOKEN: token,
        CMS_REPOSITORY_URL: parseHttpUrl(requiredEnv(source, "CMS_REPOSITORY_URL"), "CMS_REPOSITORY_URL"),
        CMS_GATEWAY_SITE_ID: parseSelectionSiteId(requiredEnv(source, "CMS_GATEWAY_SITE_ID")),
        MONGO_URL: requiredEnv(source, "MONGO_URL"),
        CMS_FILES_DIR: requiredEnv(source, "CMS_FILES_DIR"),
        CMS_SESSION_SECRET: requiredEnv(source, "CMS_SESSION_SECRET"),
        CMS_KEK: parseRuntimeKekConfig(source),
        CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: migrationRetention,
        CMS_ADMIN_EMAIL: requiredEnv(source, "CMS_ADMIN_EMAIL"),
        KERNEL_PUBLIC_URL: parseHttpUrl(requiredEnv(source, "KERNEL_PUBLIC_URL"), "KERNEL_PUBLIC_URL"),
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
