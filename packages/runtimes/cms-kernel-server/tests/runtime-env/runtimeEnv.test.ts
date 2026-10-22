import { describe, expect, test } from "bun:test";
import { parsePort, readRuntimeEnv } from "../../src/runtimeEnv";

const validEnv = () => ({
    KERNEL_PUBLIC_URL: "https://www.example.com",
    CMS_INSTALLATIONS_PROVIDER_URL: "http://127.0.0.1:5103",
    CMS_INSTALLATIONS_PROVIDER_TOKEN: "opaque-ulvia-instance-token",
});

describe("stateless Kernel runtime env", () => {
    test("requires only listener and Provider connection settings", () => {
        expect(readRuntimeEnv(validEnv())).toEqual({
            MODE: "PROD",
            KERNEL_PORT: 3000,
            KERNEL_HOST: "0.0.0.0",
            KERNEL_PUBLIC_URL: "https://www.example.com",
            CMS_INSTALLATIONS_PROVIDER_URL: "http://127.0.0.1:5103",
            CMS_INSTALLATIONS_PROVIDER_TOKEN: "opaque-ulvia-instance-token",
        });
    });

    test("validates listener and Provider credentials", () => {
        expect(() => parsePort("65536", "KERNEL_PORT", 3000)).toThrow(/between 1 and 65535/);
        expect(() => readRuntimeEnv({ ...validEnv(), KERNEL_HOST: "bad host" })).toThrow(/hostname or IP/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_INSTALLATIONS_PROVIDER_TOKEN: "invalid" })).toThrow(
            /CMS_INSTALLATIONS_PROVIDER_TOKEN is invalid/,
        );
    });
});
