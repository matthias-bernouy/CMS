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
        CMS_KEK_HEX: "00".repeat(32),
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
});
