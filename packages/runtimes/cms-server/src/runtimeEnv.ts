import {
    parseBoolean,
    parseBoundedNumber,
    parseHttpUrl,
    parseNonNegativeInteger,
    parsePositiveInteger,
    parseOptionalHttpUrl,
    parsePort,
    requiredEnv,
    type RuntimeEnvSource,
} from "./runtimeEnvParsing";

export { parsePort } from "./runtimeEnvParsing";

export type RuntimeEnv = {
    CONTROL_PORT: number;
    DELIVERY_PORT: number;
    CONTROL_PUBLIC_URL: string;
    DELIVERY_PUBLIC_URL: string;
    CMS_SESSION_SECRET: string;
    CMS_KEK_HEX: string;
    CMS_ADMIN_EMAIL: string;
    CMS_ADMIN_PASSWORD: string;
    CMS_FILES_DIR: string;
    MONGO_URL: string;
    CMS_AUTH_SITE_NAME: string;
    CMS_AUTH_EMAIL_COOLDOWN_SECONDS: number;
    CMS_AUTH_EMAIL_VERIFICATION_URL: string;
    CMS_AUTH_PASSWORD_RESET_URL: string;
    CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL: string;
    CMS_CONTROL_AUTH_PASSWORD_RESET_URL: string;
    ANALYTICS_SALT_SECRET: string;
    ANALYTICS_TRUST_PROXY: boolean;
    ANALYTICS_TRUSTED_PROXY_VERIFIED: boolean;
    ENDPOINT_PERFORMANCE_ENABLED: boolean;
    SOURCE_TIMING_SAMPLE_RATE: number;
    SOURCE_SLOW_REQUEST_THRESHOLD_MS: number;
    CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: boolean;
    CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: boolean;
    CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: boolean;
    CMS_HTTP_CLIENT_ADDRESS_MODE: "direct" | "disabled" | "trusted-proxy";
    CMS_HTTP_TRUSTED_PROXY_HOPS: number;
    CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: number;
    CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: number;
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

    return {
        CONTROL_PORT,
        DELIVERY_PORT,
        CONTROL_PUBLIC_URL,
        DELIVERY_PUBLIC_URL,
        CMS_SESSION_SECRET: requiredEnv(source, "CMS_SESSION_SECRET"),
        CMS_KEK_HEX: requiredEnv(source, "CMS_KEK_HEX"),
        CMS_ADMIN_EMAIL: requiredEnv(source, "CMS_ADMIN_EMAIL"),
        CMS_ADMIN_PASSWORD: requiredEnv(source, "CMS_ADMIN_PASSWORD"),
        CMS_FILES_DIR: requiredEnv(source, "CMS_FILES_DIR"),
        MONGO_URL: requiredEnv(source, "MONGO_URL"),
        CMS_AUTH_SITE_NAME: source.CMS_AUTH_SITE_NAME?.trim() || "CMS",
        CMS_AUTH_EMAIL_COOLDOWN_SECONDS: parseNonNegativeInteger(
            source.CMS_AUTH_EMAIL_COOLDOWN_SECONDS,
            "CMS_AUTH_EMAIL_COOLDOWN_SECONDS",
            300,
        ),
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
        ANALYTICS_SALT_SECRET: requiredEnv(source, "ANALYTICS_SALT_SECRET"),
        ANALYTICS_TRUST_PROXY: parseBoolean(source.ANALYTICS_TRUST_PROXY, "ANALYTICS_TRUST_PROXY", false),
        ANALYTICS_TRUSTED_PROXY_VERIFIED: parseBoolean(
            source.ANALYTICS_TRUSTED_PROXY_VERIFIED,
            "ANALYTICS_TRUSTED_PROXY_VERIFIED",
            false,
        ),
        ENDPOINT_PERFORMANCE_ENABLED: parseBoolean(
            source.ENDPOINT_PERFORMANCE_ENABLED,
            "ENDPOINT_PERFORMANCE_ENABLED",
            true,
        ),
        SOURCE_TIMING_SAMPLE_RATE: parseBoundedNumber(
            source.SOURCE_TIMING_SAMPLE_RATE,
            "SOURCE_TIMING_SAMPLE_RATE",
            0.01,
            0,
            1,
        ),
        SOURCE_SLOW_REQUEST_THRESHOLD_MS: parseBoundedNumber(
            source.SOURCE_SLOW_REQUEST_THRESHOLD_MS,
            "SOURCE_SLOW_REQUEST_THRESHOLD_MS",
            1_000,
            0,
            300_000,
        ),
        CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: parseBoolean(
            source.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED,
            "CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED",
            false,
        ),
        CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: parseBoolean(
            source.CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED,
            "CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED",
            false,
        ),
        CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: parseBoolean(
            source.CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED,
            "CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED",
            false,
        ),
        ...clientAddress,
        CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: parsePositiveInteger(
            source.CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT,
            "CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT",
            60,
        ),
        CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: parsePositiveInteger(
            source.CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS,
            "CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS",
            60,
        ),
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
