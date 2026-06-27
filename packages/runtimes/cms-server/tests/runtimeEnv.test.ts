import { describe, expect, test } from "bun:test";
import { parsePort, readRuntimeEnv } from "../src/runtimeEnv";

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
    });

    test("rejects invalid and duplicate ports", () => {
        expect(() => parsePort("abc", "CONTROL_PORT", 3000)).toThrow(/integer port/);
        expect(() => parsePort("65536", "CONTROL_PORT", 3000)).toThrow(/between 1 and 65535/);
        expect(() => readRuntimeEnv({ ...validEnv(), CONTROL_PORT: "4000", DELIVERY_PORT: "4000" }))
            .toThrow(/must be distinct/);
    });

    test("rejects public and override URLs outside http or https", () => {
        expect(() => readRuntimeEnv({ ...validEnv(), CONTROL_PUBLIC_URL: "ftp://admin.example.com" }))
            .toThrow(/CONTROL_PUBLIC_URL must use http/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_AUTH_PASSWORD_RESET_URL: "not a url" }))
            .toThrow(/CMS_AUTH_PASSWORD_RESET_URL must be a valid URL/);
    });
});
