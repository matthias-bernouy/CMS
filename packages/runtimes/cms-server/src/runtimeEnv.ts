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
};

type EnvSource = Record<string, string | undefined>;

export function readRuntimeEnv(source: EnvSource): RuntimeEnv {
    const CONTROL_PORT = parsePort(source.CONTROL_PORT, "CONTROL_PORT", 3000);
    const DELIVERY_PORT = parsePort(source.DELIVERY_PORT, "DELIVERY_PORT", 3001);
    if (CONTROL_PORT === DELIVERY_PORT) {
        throw new Error("CONTROL_PORT and DELIVERY_PORT must be distinct");
    }

    const CONTROL_PUBLIC_URL = parseHttpUrl(required(source, "CONTROL_PUBLIC_URL"), "CONTROL_PUBLIC_URL");
    const DELIVERY_PUBLIC_URL = parseHttpUrl(required(source, "DELIVERY_PUBLIC_URL"), "DELIVERY_PUBLIC_URL");

    return {
        CONTROL_PORT,
        DELIVERY_PORT,
        CONTROL_PUBLIC_URL,
        DELIVERY_PUBLIC_URL,
        CMS_SESSION_SECRET: required(source, "CMS_SESSION_SECRET"),
        CMS_KEK_HEX: required(source, "CMS_KEK_HEX"),
        CMS_ADMIN_EMAIL: required(source, "CMS_ADMIN_EMAIL"),
        CMS_ADMIN_PASSWORD: required(source, "CMS_ADMIN_PASSWORD"),
        CMS_FILES_DIR: required(source, "CMS_FILES_DIR"),
        MONGO_URL: required(source, "MONGO_URL"),
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
        ANALYTICS_SALT_SECRET: required(source, "ANALYTICS_SALT_SECRET"),
        ANALYTICS_TRUST_PROXY: parseBoolean(source.ANALYTICS_TRUST_PROXY, false),
        ANALYTICS_TRUSTED_PROXY_VERIFIED: parseBoolean(source.ANALYTICS_TRUSTED_PROXY_VERIFIED, false),
        ENDPOINT_PERFORMANCE_ENABLED: parseBoolean(source.ENDPOINT_PERFORMANCE_ENABLED, true),
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
    };
}

export function parsePort(raw: string | undefined, name: string, fallback: number): number {
    if (raw === undefined) {
        return fallback;
    }
    if (!/^\d+$/.test(raw)) {
        throw new Error(`${name} must be an integer port`);
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${name} must be between 1 and 65535`);
    }
    return port;
}

function required(source: EnvSource, name: string): string {
    const value = source[name]?.trim();
    if (!value) {
        throw new Error(`env ${name} missing`);
    }
    return value;
}

function parseOptionalHttpUrl(raw: string | undefined, name: string, fallback: string): string {
    if (raw === undefined) {
        return fallback;
    }
    return parseHttpUrl(raw, name);
}

function parseHttpUrl(raw: string, name: string): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error(`${name} must be a valid URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`${name} must use http:// or https://`);
    }
    return url.href.replace(/\/$/, "");
}

function parseNonNegativeInteger(raw: string | undefined, name: string, fallback: number): number {
    if (raw === undefined) {
        return fallback;
    }
    if (!/^\d+$/.test(raw)) {
        throw new Error(`${name} must be a non-negative integer`);
    }
    return Number(raw);
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) {
        return fallback;
    }
    if (raw === "true") {
        return true;
    }
    if (raw === "false") {
        return false;
    }
    throw new Error("boolean environment values must be true or false");
}

function parseBoundedNumber(
    raw: string | undefined,
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
): number {
    if (raw === undefined) {
        return fallback;
    }
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be between ${minimum} and ${maximum}`);
    }
    return value;
}
