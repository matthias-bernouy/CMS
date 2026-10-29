import { describe, expect, test } from "bun:test";
import { parsePort, readRuntimeEnv } from "../../src/runtimeEnv";

const validEnv = () => ({
    CMS_PUBLIC_URL: "https://www.example.com",
    CMS_INSTALLATIONS_PROVIDER_URL: "http://127.0.0.1:5103",
    CMS_INSTALLATIONS_PROVIDER_TOKEN: "opaque-ulvia-instance-token",
});

describe("stateless Edge runtime env", () => {
    test("requires only listener and Provider connection settings", () => {
        expect(readRuntimeEnv(validEnv())).toEqual({
            MODE: "PROD",
            CMS_EDGE_RESPONSE_CACHE: true,
            CMS_CSP_ALLOWED_ORIGINS: { connectExtras: [], mediaExtras: [] },
            CMS_PORT: 3000,
            CMS_HOST: "0.0.0.0",
            CMS_PUBLIC_URL: "https://www.example.com",
            CMS_INSTALLATIONS_PROVIDER_URL: "http://127.0.0.1:5103",
            CMS_INSTALLATIONS_PROVIDER_TOKEN: "opaque-ulvia-instance-token",
        });
    });

    test("validates listener and Provider credentials", () => {
        expect(() => parsePort("65536", "CMS_PORT", 3000)).toThrow(/between 1 and 65535/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_HOST: "bad host" })).toThrow(/hostname or IP/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_INSTALLATIONS_PROVIDER_TOKEN: "invalid" })).toThrow(
            /CMS_INSTALLATIONS_PROVIDER_TOKEN is invalid/,
        );
    });
});
