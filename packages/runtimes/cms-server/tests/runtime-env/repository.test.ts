import { describe, expect, test } from "bun:test";
import { readRuntimeEnv } from "../../src/runtimeEnv";

describe("repository runtime environment", () => {
    test("keeps download protection explicitly disabled for bare processes", () => {
        expect(readRuntimeEnv(validEnv())).toMatchObject({
            CMS_HTTP_CLIENT_ADDRESS_MODE: "disabled",
            CMS_HTTP_TRUSTED_PROXY_HOPS: 0,
            CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: 60,
            CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: 60,
        });
    });

    test("parses direct, one-hop, and CDN two-hop policies", () => {
        expect(readRuntimeEnv({ ...validEnv(), CMS_HTTP_CLIENT_ADDRESS_MODE: "direct" })).toMatchObject({
            CMS_HTTP_CLIENT_ADDRESS_MODE: "direct",
            CMS_HTTP_TRUSTED_PROXY_HOPS: 0,
        });
        expect(
            readRuntimeEnv({
                ...validEnv(),
                CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
                CMS_HTTP_TRUSTED_PROXY_HOPS: "1",
            }),
        ).toMatchObject({ CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy", CMS_HTTP_TRUSTED_PROXY_HOPS: 1 });
        expect(
            readRuntimeEnv({
                ...validEnv(),
                CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
                CMS_HTTP_TRUSTED_PROXY_HOPS: "2",
            }),
        ).toMatchObject({ CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy", CMS_HTTP_TRUSTED_PROXY_HOPS: 2 });
    });

    test("rejects invalid or contradictory proxy policies", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_HTTP_CLIENT_ADDRESS_MODE: "automatic" })).toThrow(
            /must be disabled, direct, or trusted-proxy/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy" })).toThrow(
            /CMS_HTTP_TRUSTED_PROXY_HOPS is required/,
        );
        expect(() =>
            readRuntimeEnv({
                ...validEnv(),
                CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
                CMS_HTTP_TRUSTED_PROXY_HOPS: "0",
            }),
        ).toThrow(/positive safe integer/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_HTTP_TRUSTED_PROXY_HOPS: "1" })).toThrow(
            /must be 0 when client-address mode is disabled/,
        );
    });

    test("requires positive package download windows", () => {
        expect(
            readRuntimeEnv({
                ...validEnv(),
                CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: "12",
                CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: "90",
            }),
        ).toMatchObject({
            CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: 12,
            CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: 90,
        });
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: "0" })).toThrow(
            /positive safe integer/,
        );
    });
});

function validEnv() {
    return {
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
    };
}
