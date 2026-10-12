import {
    parseHttpUrl,
    parseNonNegativeInteger,
    parsePositiveInteger,
    parseOptionalHttpUrl,
    parsePort,
    requiredEnv,
    type RuntimeEnvSource,
} from "./runtimeEnvParsing";
import { parseSelectionSiteId } from "@bernouy/cms-repository/providers/selections";
import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";
import { parseRuntimeKekConfig, type RuntimeKekConfig } from "./runtimeEnvKek";

export { parsePort } from "./runtimeEnvParsing";

export type RuntimeEnv = {
    MODE: "DEV" | "PROD";
    KERNEL_PORT: number;
    KERNEL_HOST: string;
    KERNEL_PUBLIC_URL: string;
    ULVIA_PROVIDER_PUBLIC_URL?: string;
    CMS_SESSION_SECRET: string;
    CMS_KEK_HEX?: string;
    CMS_KEK: RuntimeKekConfig;
    CMS_ADMIN_EMAIL: string;
    CMS_ADMIN_PASSWORD: string;
    CMS_GATEWAY_SITE_ID?: string;
    ULVIA_PROVIDER_TOKEN?: string;
    CMS_REPOSITORY_URL?: string;
    CMS_FILES_DIR: string;
    MONGO_URL: string;
    CMS_AUTH_SITE_NAME: string;
    CMS_AUTH_EMAIL_COOLDOWN_SECONDS: number;
    CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: number;
    CMS_AUTH_EMAIL_VERIFICATION_URL: string;
    CMS_AUTH_PASSWORD_RESET_URL: string;
    CMS_HTTP_CLIENT_ADDRESS_MODE: "direct" | "disabled" | "trusted-proxy";
    CMS_HTTP_TRUSTED_PROXY_HOPS: number;
};

export function readRuntimeEnv(source: RuntimeEnvSource): RuntimeEnv {
    const MODE = parseRuntimeMode(source.MODE);
    const KERNEL_PORT = parsePort(source.KERNEL_PORT, "KERNEL_PORT", 3000);
    const KERNEL_PUBLIC_URL = parseHttpUrl(requiredEnv(source, "KERNEL_PUBLIC_URL"), "KERNEL_PUBLIC_URL");
    const clientAddress = parseClientAddressConfig(source);
    const kek = parseRuntimeKekConfig(source);
    const migrationRetention = parseNonNegativeInteger(
        source.CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION,
        "CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION",
        100,
    );
    if (migrationRetention > 10_000) {
        throw new Error("CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION must be at most 10000");
    }
    const providerConfiguration = parseUlviaProviderConfig(source);

    return {
        MODE,
        KERNEL_PORT,
        KERNEL_HOST: parseListenerHost(source.KERNEL_HOST, "KERNEL_HOST"),
        ...providerConfiguration,
        KERNEL_PUBLIC_URL,
        CMS_SESSION_SECRET: requiredEnv(source, "CMS_SESSION_SECRET"),
        ...(kek.keysHex.legacy ? { CMS_KEK_HEX: kek.keysHex.legacy } : {}),
        CMS_KEK: kek,
        CMS_ADMIN_EMAIL: requiredEnv(source, "CMS_ADMIN_EMAIL"),
        CMS_ADMIN_PASSWORD: requiredEnv(source, "CMS_ADMIN_PASSWORD"),
        ...(!source.CMS_GATEWAY_SITE_ID?.trim()
            ? {}
            : { CMS_GATEWAY_SITE_ID: parseSelectionSiteId(source.CMS_GATEWAY_SITE_ID.trim()) }),
        ...(!source.CMS_REPOSITORY_URL?.trim()
            ? {}
            : {
                  CMS_REPOSITORY_URL: parseHttpUrl(source.CMS_REPOSITORY_URL.trim(), "CMS_REPOSITORY_URL"),
              }),
        CMS_FILES_DIR: requiredEnv(source, "CMS_FILES_DIR"),
        MONGO_URL: requiredEnv(source, "MONGO_URL"),
        CMS_AUTH_SITE_NAME: source.CMS_AUTH_SITE_NAME?.trim() || "CMS",
        CMS_AUTH_EMAIL_COOLDOWN_SECONDS: parseNonNegativeInteger(
            source.CMS_AUTH_EMAIL_COOLDOWN_SECONDS,
            "CMS_AUTH_EMAIL_COOLDOWN_SECONDS",
            300,
        ),
        CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: migrationRetention,
        CMS_AUTH_EMAIL_VERIFICATION_URL: parseOptionalHttpUrl(
            source.CMS_AUTH_EMAIL_VERIFICATION_URL,
            "CMS_AUTH_EMAIL_VERIFICATION_URL",
            `${KERNEL_PUBLIC_URL}/auth/confirm-email`,
        ),
        CMS_AUTH_PASSWORD_RESET_URL: parseOptionalHttpUrl(
            source.CMS_AUTH_PASSWORD_RESET_URL,
            "CMS_AUTH_PASSWORD_RESET_URL",
            `${KERNEL_PUBLIC_URL}/auth/reset-password`,
        ),
        ...clientAddress,
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
): Pick<RuntimeEnv, "ULVIA_PROVIDER_PUBLIC_URL" | "ULVIA_PROVIDER_TOKEN"> {
    const configured = [source.ULVIA_PROVIDER_PUBLIC_URL, source.ULVIA_PROVIDER_TOKEN].map((value) =>
        Boolean(value?.trim()),
    );
    if (configured.some(Boolean) && !configured.every(Boolean)) {
        throw new Error("ULVIA_PROVIDER_PUBLIC_URL and ULVIA_PROVIDER_TOKEN must be configured together");
    }
    if (!configured[0]) {
        return {};
    }
    if (!source.CMS_REPOSITORY_URL?.trim() || !source.CMS_GATEWAY_SITE_ID?.trim()) {
        throw new Error("Ulvia Provider bootstrap requires CMS_REPOSITORY_URL and CMS_GATEWAY_SITE_ID");
    }
    const token = source.ULVIA_PROVIDER_TOKEN!;
    try {
        assertProviderConnectionToken(token);
    } catch {
        throw new Error("ULVIA_PROVIDER_TOKEN is invalid");
    }
    return {
        ULVIA_PROVIDER_PUBLIC_URL: parseHttpUrl(source.ULVIA_PROVIDER_PUBLIC_URL!, "ULVIA_PROVIDER_PUBLIC_URL"),
        ULVIA_PROVIDER_TOKEN: token,
    };
}

function parseClientAddressConfig(
    source: RuntimeEnvSource,
): Pick<RuntimeEnv, "CMS_HTTP_CLIENT_ADDRESS_MODE" | "CMS_HTTP_TRUSTED_PROXY_HOPS"> {
    const mode = source.CMS_HTTP_CLIENT_ADDRESS_MODE?.trim() || "disabled";
    if (mode !== "disabled" && mode !== "direct" && mode !== "trusted-proxy") {
        throw new Error("CMS_HTTP_CLIENT_ADDRESS_MODE must be disabled, direct, or trusted-proxy");
    }
    if (mode === "trusted-proxy") {
        return {
            CMS_HTTP_CLIENT_ADDRESS_MODE: mode,
            CMS_HTTP_TRUSTED_PROXY_HOPS: parsePositiveInteger(
                source.CMS_HTTP_TRUSTED_PROXY_HOPS,
                "CMS_HTTP_TRUSTED_PROXY_HOPS",
            ),
        };
    }
    const hops = parseNonNegativeInteger(source.CMS_HTTP_TRUSTED_PROXY_HOPS, "CMS_HTTP_TRUSTED_PROXY_HOPS", 0);
    if (hops !== 0) {
        throw new Error(`CMS_HTTP_TRUSTED_PROXY_HOPS must be 0 when client-address mode is ${mode}`);
    }
    return { CMS_HTTP_CLIENT_ADDRESS_MODE: mode, CMS_HTTP_TRUSTED_PROXY_HOPS: 0 };
}
