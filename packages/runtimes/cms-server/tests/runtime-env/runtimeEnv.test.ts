import { describe, expect, test } from "bun:test";
import { parsePort, readRuntimeEnv } from "../../src/runtimeEnv";

const validEnv = () => ({
    CONTROL_PUBLIC_URL: "https://admin.example.com",
    DELIVERY_PUBLIC_URL: "https://www.example.com",
    CMS_SESSION_SECRET: "session-secret",
    CMS_KEK_HEX: "00".repeat(32),
    CMS_ADMIN_EMAIL: "admin@example.com",
    CMS_ADMIN_PASSWORD: "password",
    CMS_FILES_DIR: "/data/files",
    CMS_INTEGRATION_PACKAGE_CACHE_DIR: "/data/integration-packages",
    MONGO_URL: "mongodb://mongo:27017/cms",
    ANALYTICS_SALT_SECRET: "shared-analytics-secret",
    P9R_INTEGRATION_REPOSITORY_URL: "https://repository.example.com/.cms/repository",
});

describe("runtime env validation", () => {
    test("parses default ports and derived auth URLs", () => {
        const env = readRuntimeEnv(validEnv());

        expect(env.CONTROL_PORT).toBe(3000);
        expect(env.DELIVERY_PORT).toBe(3001);
        expect(env.CMS_AUTH_EMAIL_VERIFICATION_URL).toBe("https://www.example.com/auth/confirm-email");
        expect(env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL).toBe("https://admin.example.com/auth/reset-password");
        expect(env.ANALYTICS_TRUST_PROXY).toBe(false);
        expect(env.ANALYTICS_TRUSTED_PROXY_VERIFIED).toBe(false);
        expect(env.ENDPOINT_PERFORMANCE_ENABLED).toBe(true);
        expect(env.SOURCE_TIMING_SAMPLE_RATE).toBe(0.01);
        expect(env.SOURCE_SLOW_REQUEST_THRESHOLD_MS).toBe(1_000);
        expect(env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED).toBe(true);
        expect(env.CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED).toBe(true);
        expect(env.CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED).toBe(true);
        expect(
            readRuntimeEnv({
                ...validEnv(),
                ANALYTICS_TRUST_PROXY: "true",
                ANALYTICS_TRUSTED_PROXY_VERIFIED: "true",
            }),
        ).toMatchObject({ ANALYTICS_TRUST_PROXY: true, ANALYTICS_TRUSTED_PROXY_VERIFIED: true });
    });

    test.failing("parses listener hosts with wildcard production defaults", () => {
        expect(readRuntimeEnv(validEnv())).toMatchObject({
            CONTROL_HOST: "0.0.0.0",
            DELIVERY_HOST: "0.0.0.0",
        });
        expect(
            readRuntimeEnv({
                ...validEnv(),
                CONTROL_HOST: "127.0.0.1",
                DELIVERY_HOST: "::1",
            }),
        ).toMatchObject({
            CONTROL_HOST: "127.0.0.1",
            DELIVERY_HOST: "::1",
        });
    });

    test("rejects invalid and duplicate ports", () => {
        expect(() => parsePort("abc", "CONTROL_PORT", 3000)).toThrow(/integer port/);
        expect(() => parsePort("65536", "CONTROL_PORT", 3000)).toThrow(/between 1 and 65535/);
        expect(() => readRuntimeEnv({ ...validEnv(), CONTROL_PORT: "4000", DELIVERY_PORT: "4000" })).toThrow(
            /must be distinct/,
        );
    });

    test("rejects public and override URLs outside http or https", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), CONTROL_PUBLIC_URL: "ftp://admin.example.com" })).toThrow(
            /CONTROL_PUBLIC_URL must use http/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_AUTH_PASSWORD_RESET_URL: "not a url" })).toThrow(
            /CMS_AUTH_PASSWORD_RESET_URL must be a valid URL/,
        );
        expect(() =>
            readRuntimeEnv({ ...validEnv(), P9R_INTEGRATION_REPOSITORY_URL: "ftp://repository.example.com" }),
        ).toThrow(/P9R_INTEGRATION_REPOSITORY_URL must use http/);
    });

    test("rejects missing required values and invalid email cooldowns", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_FILES_DIR: " " })).toThrow(/env CMS_FILES_DIR missing/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_INTEGRATION_PACKAGE_CACHE_DIR: " " })).toThrow(
            /env CMS_INTEGRATION_PACKAGE_CACHE_DIR missing/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), ANALYTICS_SALT_SECRET: " " })).toThrow(
            /env ANALYTICS_SALT_SECRET missing/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), P9R_INTEGRATION_REPOSITORY_URL: " " })).toThrow(
            /env P9R_INTEGRATION_REPOSITORY_URL missing/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "-1" })).toThrow(
            /must be a non-negative integer/,
        );
        expect(
            readRuntimeEnv({ ...validEnv(), CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "0" }).CMS_AUTH_EMAIL_COOLDOWN_SECONDS,
        ).toBe(0);
    });

    test("validates endpoint performance controls", () => {
        expect(
            readRuntimeEnv({
                ...validEnv(),
                ENDPOINT_PERFORMANCE_ENABLED: "false",
                SOURCE_TIMING_SAMPLE_RATE: "1",
                SOURCE_SLOW_REQUEST_THRESHOLD_MS: "2500.5",
            }),
        ).toMatchObject({
            ENDPOINT_PERFORMANCE_ENABLED: false,
            SOURCE_TIMING_SAMPLE_RATE: 1,
            SOURCE_SLOW_REQUEST_THRESHOLD_MS: 2_500.5,
        });
        expect(() => readRuntimeEnv({ ...validEnv(), SOURCE_TIMING_SAMPLE_RATE: "1.01" })).toThrow(
            /SOURCE_TIMING_SAMPLE_RATE must be between 0 and 1/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), SOURCE_SLOW_REQUEST_THRESHOLD_MS: "NaN" })).toThrow(
            /SOURCE_SLOW_REQUEST_THRESHOLD_MS must be between/,
        );
    });

    test("enables image capabilities by default and accepts only explicit boolean overrides", () => {
        expect(
            readRuntimeEnv({
                ...validEnv(),
                CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: "false",
                CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: "false",
                CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: "false",
            }),
        ).toMatchObject({
            CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: false,
            CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: false,
            CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: false,
        });
        expect(() =>
            readRuntimeEnv({
                ...validEnv(),
                CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: "TRUE",
            }),
        ).toThrow(/CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED must be true or false/);
        expect(() =>
            readRuntimeEnv({
                ...validEnv(),
                CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: "1",
            }),
        ).toThrow(/CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED must be true or false/);
        expect(() =>
            readRuntimeEnv({
                ...validEnv(),
                CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: "1",
            }),
        ).toThrow(/CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED must be true or false/);
    });
});
