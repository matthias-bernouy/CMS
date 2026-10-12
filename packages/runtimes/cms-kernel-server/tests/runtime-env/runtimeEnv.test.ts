import { describe, expect, test } from "bun:test";
import { parsePort, readRuntimeEnv } from "../../src/runtimeEnv";

const validEnv = () => ({
    KERNEL_PUBLIC_URL: "https://www.example.com",
    ULVIA_PROVIDER_URL: "http://127.0.0.1:5103",
    ULVIA_INSTANCE_TOKEN: "opaque-ulvia-instance-token",
    CMS_SESSION_SECRET: "session-secret",
    CMS_KEK_HEX: "00".repeat(32),
    CMS_FILES_DIR: "/data/files",
    MONGO_URL: "mongodb://mongo:27017/cms",
});

describe("runtime env validation", () => {
    test("parses default ports and derived auth URLs", () => {
        const env = readRuntimeEnv(validEnv());

        expect(env.MODE).toBe("PROD");
        expect(readRuntimeEnv({ ...validEnv(), MODE: "DEV" }).MODE).toBe("DEV");
        expect(env.KERNEL_PORT).toBe(3000);
        expect(env.CMS_AUTH_EMAIL_VERIFICATION_URL).toBe("https://www.example.com/auth/confirm-email");
        expect(env.CMS_AUTH_PASSWORD_RESET_URL).toBe("https://www.example.com/auth/reset-password");
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

    test("parses listener hosts with wildcard production defaults", () => {
        expect(readRuntimeEnv(validEnv())).toMatchObject({
            KERNEL_HOST: "0.0.0.0",
        });
        expect(
            readRuntimeEnv({
                ...validEnv(),
                KERNEL_HOST: "::1",
            }),
        ).toMatchObject({
            KERNEL_HOST: "::1",
        });
    });

    test("rejects malformed listener hosts and embedded ports", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), KERNEL_HOST: "bad host" })).toThrow(/hostname or IP/);
        expect(() => readRuntimeEnv({ ...validEnv(), KERNEL_HOST: "localhost:3001" })).toThrow(/hostname or IP/);
    });

    test("rejects invalid and duplicate ports", () => {
        expect(() => parsePort("abc", "KERNEL_PORT", 3000)).toThrow(/integer port/);
        expect(() => parsePort("65536", "KERNEL_PORT", 3000)).toThrow(/between 1 and 65535/);
    });

    test("rejects public and override URLs outside http or https", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), KERNEL_PUBLIC_URL: "ftp://admin.example.com" })).toThrow(
            /KERNEL_PUBLIC_URL must use http/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_AUTH_PASSWORD_RESET_URL: "not a url" })).toThrow(
            /CMS_AUTH_PASSWORD_RESET_URL must be a valid URL/,
        );
    });

    test("rejects missing required values and invalid email cooldowns", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), MODE: "test" })).toThrow(/MODE must be DEV or PROD/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_FILES_DIR: " " })).toThrow(/env CMS_FILES_DIR missing/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "-1" })).toThrow(
            /must be a non-negative integer/,
        );
        expect(
            readRuntimeEnv({ ...validEnv(), CMS_AUTH_EMAIL_COOLDOWN_SECONDS: "0" }).CMS_AUTH_EMAIL_COOLDOWN_SECONDS,
        ).toBe(0);
    });

    test("requires one pre-provisioned Ulvia Provider instance connection", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), ULVIA_PROVIDER_URL: undefined })).toThrow(
            /ULVIA_PROVIDER_URL missing/,
        );
        expect(() => readRuntimeEnv({ ...validEnv(), ULVIA_INSTANCE_TOKEN: undefined })).toThrow(
            /ULVIA_INSTANCE_TOKEN missing/,
        );
        expect(readRuntimeEnv(validEnv())).toMatchObject({
            ULVIA_PROVIDER_URL: "http://127.0.0.1:5103",
            ULVIA_INSTANCE_TOKEN: "opaque-ulvia-instance-token",
        });
        for (const token of [
            " opaque-ulvia-instance-token",
            "opaque-ulvia-instance-token ",
            "opaque-ulvia-instance-tokén",
        ]) {
            expect(() =>
                readRuntimeEnv({
                    ...validEnv(),
                    ULVIA_INSTANCE_TOKEN: token,
                }),
            ).toThrow("ULVIA_INSTANCE_TOKEN is invalid");
        }
    });
});
