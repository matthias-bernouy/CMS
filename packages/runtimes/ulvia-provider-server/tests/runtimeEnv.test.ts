import { describe, expect, test } from "bun:test";
import { readProviderRuntimeEnv } from "../src/runtimeEnv";

function validEnv(): Record<string, string> {
    return {
        ULVIA_PROVIDER_PORT: "5103",
        ULVIA_PROVIDER_HOST: "127.0.0.1",
        ULVIA_PROVIDER_PUBLIC_URL: "http://127.0.0.1:5103",
        ULVIA_PROVIDER_OPERATOR_TOKEN: "opaque-ulvia-operator-token",
        CMS_REPOSITORY_URL: "http://127.0.0.1:5102",
        CMS_REPOSITORY_ALLOW_INSECURE_HTTP: "false",
        MONGO_URL: "mongodb://127.0.0.1:27017/cms",
        CMS_FILES_DIR: "/tmp/cms-files",
        CMS_SESSION_SECRET: "session-secret",
        CMS_KEK_ACTIVE_ID: "control",
        CMS_KEK_RING_JSON: JSON.stringify({ control: "00".repeat(32) }),
    };
}

describe("Ulvia Provider server environment", () => {
    test("accepts an independent Provider listener", () => {
        expect(readProviderRuntimeEnv(validEnv())).toMatchObject({
            ULVIA_PROVIDER_PORT: 5103,
            ULVIA_PROVIDER_HOST: "127.0.0.1",
            ULVIA_PROVIDER_OPERATOR_TOKEN: "opaque-ulvia-operator-token",
            CMS_REPOSITORY_ALLOW_INSECURE_HTTP: false,
        });
    });

    test("requires the public URL to identify the Provider listener", () => {
        expect(() =>
            readProviderRuntimeEnv({ ...validEnv(), ULVIA_PROVIDER_PUBLIC_URL: "http://127.0.0.1:5999" }),
        ).toThrow("ULVIA_PROVIDER_PUBLIC_URL must identify the configured ULVIA_PROVIDER_PORT root");
    });

    test("accepts only an absolute directory for a packaged local model", () => {
        expect(
            readProviderRuntimeEnv({ ...validEnv(), ULVIA_EMBEDDING_MODEL_DIR: "/opt/ulvia/models" })
                .ULVIA_EMBEDDING_MODEL_DIR,
        ).toBe("/opt/ulvia/models");
        expect(() => readProviderRuntimeEnv({ ...validEnv(), ULVIA_EMBEDDING_MODEL_DIR: "models" })).toThrow(
            "ULVIA_EMBEDDING_MODEL_DIR",
        );
    });

    test("accepts only an absolute directory for bundled bootstrap artifacts", () => {
        expect(
            readProviderRuntimeEnv({ ...validEnv(), ULVIA_BOOTSTRAP_DIR: "/opt/ulvia/bootstrap" }).ULVIA_BOOTSTRAP_DIR,
        ).toBe("/opt/ulvia/bootstrap");
        expect(() => readProviderRuntimeEnv({ ...validEnv(), ULVIA_BOOTSTRAP_DIR: "bootstrap" })).toThrow(
            "ULVIA_BOOTSTRAP_DIR",
        );
    });
    test("requires an explicit key ring and validates its active key", () => {
        const valid = validEnv();
        expect(readProviderRuntimeEnv(valid).CMS_KEK.activeKeyId).toBe("control");
        for (const field of ["CMS_KEK_ACTIVE_ID", "CMS_KEK_RING_JSON"]) {
            const incomplete = { ...valid };
            delete incomplete[field];
            expect(() => readProviderRuntimeEnv(incomplete)).toThrow(`${field} is required`);
        }
        expect(() => readProviderRuntimeEnv({ ...valid, CMS_KEK_RING_JSON: "{}" })).toThrow("missing key");
        expect(() => readProviderRuntimeEnv({ ...valid, CMS_KEK_RING_JSON: "not-json" })).toThrow("JSON object");
        expect(() =>
            readProviderRuntimeEnv({ ...valid, CMS_KEK_RING_JSON: JSON.stringify({ control: "invalid" }) }),
        ).toThrow("64 hexadecimal");
    });
});
