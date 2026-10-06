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
import { parseRuntimeKekConfig, type RuntimeKekConfig } from "./runtimeEnvKek";

export { parsePort } from "./runtimeEnvParsing";

export type RuntimeEnv = {
    CONTROL_PORT: number;
    DELIVERY_PORT: number;
    CORE_PORT?: number;
    CONTROL_PUBLIC_URL: string;
    DELIVERY_PUBLIC_URL: string;
    CORE_PUBLIC_URL?: string;
    CMS_SESSION_SECRET: string;
    CMS_KEK_HEX?: string;
    CMS_KEK: RuntimeKekConfig;
    CMS_ADMIN_EMAIL: string;
    CMS_ADMIN_PASSWORD: string;
    CMS_GATEWAY_SITE_ID?: string;
    CMS_CORE_PROVIDER_TOKEN?: string;
    CMS_PROVIDER_MEDIA_DIR?: string;
    CMS_REPOSITORY_URL?: string;
    CMS_FILES_DIR: string;
    MONGO_URL: string;
    CMS_AUTH_SITE_NAME: string;
    CMS_AUTH_EMAIL_COOLDOWN_SECONDS: number;
    CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: number;
    CMS_AUTH_EMAIL_VERIFICATION_URL: string;
    CMS_AUTH_PASSWORD_RESET_URL: string;
    CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL: string;
    CMS_CONTROL_AUTH_PASSWORD_RESET_URL: string;
    CMS_HTTP_CLIENT_ADDRESS_MODE: "direct" | "disabled" | "trusted-proxy";
    CMS_HTTP_TRUSTED_PROXY_HOPS: number;
};

export function readRuntimeEnv(source: RuntimeEnvSource): RuntimeEnv {
    const CONTROL_PORT = parsePort(source.CONTROL_PORT, "CONTROL_PORT", 3000);
    const DELIVERY_PORT = parsePort(source.DELIVERY_PORT, "DELIVERY_PORT", 3001);
    if (CONTROL_PORT === DELIVERY_PORT) {
        throw new Error("CONTROL_PORT and DELIVERY_PORT must be distinct");
    }

    const CONTROL_PUBLIC_URL = parseHttpUrl(requiredEnv(source, "CONTROL_PUBLIC_URL"), "CONTROL_PUBLIC_URL");
    const DELIVERY_PUBLIC_URL = parseHttpUrl(requiredEnv(source, "DELIVERY_PUBLIC_URL"), "DELIVERY_PUBLIC_URL");
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
    const coreConfiguration = parseCoreProviderConfig(source, CONTROL_PORT, DELIVERY_PORT);

    return {
        CONTROL_PORT,
        DELIVERY_PORT,
        ...coreConfiguration,
        CONTROL_PUBLIC_URL,
        DELIVERY_PUBLIC_URL,
        CMS_SESSION_SECRET: requiredEnv(source, "CMS_SESSION_SECRET"),
        ...(kek.keysHex.legacy ? { CMS_KEK_HEX: kek.keysHex.legacy } : {}),
        CMS_KEK: kek,
        CMS_ADMIN_EMAIL: requiredEnv(source, "CMS_ADMIN_EMAIL"),
        CMS_ADMIN_PASSWORD: requiredEnv(source, "CMS_ADMIN_PASSWORD"),
        ...(!source.CMS_GATEWAY_SITE_ID?.trim()
            ? {}
            : { CMS_GATEWAY_SITE_ID: parseSelectionSiteId(source.CMS_GATEWAY_SITE_ID.trim()) }),
        ...(!source.CMS_PROVIDER_MEDIA_DIR?.trim()
            ? {}
            : { CMS_PROVIDER_MEDIA_DIR: source.CMS_PROVIDER_MEDIA_DIR.trim() }),
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
            `${DELIVERY_PUBLIC_URL}/auth/confirm-email`,
        ),
        CMS_AUTH_PASSWORD_RESET_URL: parseOptionalHttpUrl(
            source.CMS_AUTH_PASSWORD_RESET_URL,
            "CMS_AUTH_PASSWORD_RESET_URL",
            `${DELIVERY_PUBLIC_URL}/auth/reset-password`,
        ),
        CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL: parseOptionalHttpUrl(
            source.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
            "CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL",
            `${CONTROL_PUBLIC_URL}/auth/verify-email`,
        ),
        CMS_CONTROL_AUTH_PASSWORD_RESET_URL: parseOptionalHttpUrl(
            source.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
            "CMS_CONTROL_AUTH_PASSWORD_RESET_URL",
            `${CONTROL_PUBLIC_URL}/auth/reset-password`,
        ),
        ...clientAddress,
    };
}

function parseCoreProviderConfig(
    source: RuntimeEnvSource,
    controlPort: number,
    deliveryPort: number,
): Pick<RuntimeEnv, "CORE_PORT" | "CORE_PUBLIC_URL" | "CMS_CORE_PROVIDER_TOKEN"> {
    const configured = [source.CORE_PORT, source.CORE_PUBLIC_URL, source.CMS_CORE_PROVIDER_TOKEN].map((value) =>
        Boolean(value?.trim()),
    );
    if (configured.some(Boolean) && !configured.every(Boolean)) {
        throw new Error("CORE_PORT, CORE_PUBLIC_URL and CMS_CORE_PROVIDER_TOKEN must be configured together");
    }
    if (!configured[0]) {
        return {};
    }
    if (!source.CMS_REPOSITORY_URL?.trim() || !source.CMS_GATEWAY_SITE_ID?.trim()) {
        throw new Error("CMS Core provider bootstrap requires CMS_REPOSITORY_URL and CMS_GATEWAY_SITE_ID");
    }
    const CORE_PORT = parsePort(source.CORE_PORT, "CORE_PORT", 5103);
    if (CORE_PORT === controlPort || CORE_PORT === deliveryPort) {
        throw new Error("CORE_PORT, CONTROL_PORT and DELIVERY_PORT must be distinct");
    }
    const token = source.CMS_CORE_PROVIDER_TOKEN!.trim();
    if (token.length < 24 || token.length > 512 || /[\r\n]/u.test(token)) {
        throw new Error("CMS_CORE_PROVIDER_TOKEN is invalid");
    }
    return {
        CORE_PORT,
        CORE_PUBLIC_URL: parseHttpUrl(source.CORE_PUBLIC_URL!, "CORE_PUBLIC_URL"),
        CMS_CORE_PROVIDER_TOKEN: token,
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
