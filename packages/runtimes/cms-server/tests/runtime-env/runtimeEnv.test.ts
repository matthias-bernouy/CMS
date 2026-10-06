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
    MONGO_URL: "mongodb://mongo:27017/cms",
});

describe("runtime env validation", () => {
    test("parses default ports and derived auth URLs", () => {
        const env = readRuntimeEnv(validEnv());

        expect(env.CONTROL_PORT).toBe(3000);
        expect(env.DELIVERY_PORT).toBe(3001);
        expect(env.CMS_AUTH_EMAIL_VERIFICATION_URL).toBe("https://www.example.com/auth/confirm-email");
        expect(env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL).toBe("https://admin.example.com/auth/reset-password");
        expect(env.CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION).toBe(100);
        expect(env.CMS_KEK).toEqual({
            activeKeyId: "legacy",
            keysHex: { legacy: "00".repeat(32) },
            rotateOnStart: false,
        });
    });

    test("parses a versioned KEK ring without losing the legacy recovery key", () => {
        const env = readRuntimeEnv({
            ...validEnv(),
            CMS_KEK_ACTIVE_ID: "2026-10",
            CMS_KEK_RING_JSON: JSON.stringify({ "2026-10": "11".repeat(32) }),
            CMS_KEK_ROTATE_ON_START: "true",
        });

        expect(env.CMS_KEK).toEqual({
            activeKeyId: "2026-10",
            keysHex: { legacy: "00".repeat(32), "2026-10": "11".repeat(32) },
            rotateOnStart: true,
        });
    });

    test("allows operators to remove a historical key after every DEK has been rewrapped", () => {
        const env = readRuntimeEnv({
            ...validEnv(),
            CMS_KEK_HEX: undefined,
            CMS_KEK_ACTIVE_ID: "2026-10",
            CMS_KEK_RING_JSON: JSON.stringify({ "2026-10": "11".repeat(32) }),
        });

        expect(env.CMS_KEK_HEX).toBeUndefined();
        expect(env.CMS_KEK.keysHex).toEqual({ "2026-10": "11".repeat(32) });
    });

    test("rejects malformed, incomplete, or conflicting KEK rings", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_KEK_HEX: "not-a-key" })).toThrow(/64 hexadecimal/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_KEK_ACTIVE_ID: "missing", CMS_KEK_RING_JSON: "{}" })).toThrow(
            /references missing key/,
        );
        expect(() =>
            readRuntimeEnv({
                ...validEnv(),
                CMS_KEK_RING_JSON: JSON.stringify({ legacy: "22".repeat(32) }),
            }),
        ).toThrow(/must match CMS_KEK_HEX/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_KEK_RING_JSON: "[]" })).toThrow(/JSON object/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_KEK_ROTATE_ON_START: "yes" })).toThrow(/true or false/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_KEK_HEX: undefined })).toThrow(/ACTIVE_ID is required/);
    });

    test("validates collection migration rollback retention", () => {
        expect(
            readRuntimeEnv({ ...validEnv(), CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: "0" })
                .CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION,
        ).toBe(0);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: "-1" })).toThrow(
            /non-negative integer/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION: "10001" })).toThrow(
            /at most 10000/,
        );
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
    });

    test("rejects missing required values and invalid email cooldowns", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_FILES_DIR: " " })).toThrow(/env CMS_FILES_DIR missing/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "-1" })).toThrow(
            /must be a non-negative integer/,
        );
        expect(
            readRuntimeEnv({ ...validEnv(), CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "0" }).CMS_AUTH_EMAIL_COOLDOWN_SECONDS,
        ).toBe(0);
    });

    test("activates the capability gateway only with a valid stable site ID", () => {
        expect(readRuntimeEnv(validEnv()).CMS_GATEWAY_SITE_ID).toBeUndefined();
        expect(readRuntimeEnv({ ...validEnv(), CMS_GATEWAY_SITE_ID: "" }).CMS_GATEWAY_SITE_ID).toBeUndefined();
        expect(readRuntimeEnv({ ...validEnv(), CMS_GATEWAY_SITE_ID: "site:main" }).CMS_GATEWAY_SITE_ID).toBe(
            "site:main",
        );
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_GATEWAY_SITE_ID: "bad site" })).toThrow();
    });

    test("keeps the local provider bridge credential optional and opaque", () => {
        expect(readRuntimeEnv(validEnv()).CMS_LOCAL_PROVIDER_TOKEN).toBeUndefined();
        expect(
            readRuntimeEnv({ ...validEnv(), CMS_LOCAL_PROVIDER_TOKEN: "opaque-local-provider-core-secret" })
                .CMS_LOCAL_PROVIDER_TOKEN,
        ).toBe("opaque-local-provider-core-secret");
    });

    test("requires a complete local provider bootstrap tuple", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_LOCAL_PROVIDER_ENDPOINT: "http://127.0.0.1:5103" })).toThrow(
            /configured together/,
        );
        expect(() =>
            readRuntimeEnv({
                ...validEnv(),
                CMS_LOCAL_PROVIDER_ENDPOINT: "http://127.0.0.1:5103",
                CMS_LOCAL_PROVIDER_ACCESS_TOKEN: "opaque-token",
            }),
        ).toThrow(/requires CMS_REPOSITORY_URL/);
        expect(
            readRuntimeEnv({
                ...validEnv(),
                CMS_GATEWAY_SITE_ID: "default",
                CMS_REPOSITORY_URL: "http://127.0.0.1:5102",
                CMS_LOCAL_PROVIDER_ENDPOINT: "http://127.0.0.1:5103",
                CMS_LOCAL_PROVIDER_ACCESS_TOKEN: "opaque-token",
            }),
        ).toMatchObject({
            CMS_LOCAL_PROVIDER_ENDPOINT: "http://127.0.0.1:5103",
            CMS_LOCAL_PROVIDER_ACCESS_TOKEN: "opaque-token",
        });
    });
});
