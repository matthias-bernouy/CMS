import { describe, expect, test } from "bun:test";
import { parsePort, readRuntimeEnv } from "../../src/runtimeEnv";

const validEnv = () => ({
    CMS_HOSTING_PROVIDER_URL: "http://127.0.0.1:5103",
    CMS_HOSTING_EDGE_SECRET: "opaque-ulvia-edge-routing-key-material",
});

describe("stateless Edge runtime env", () => {
    test("requires only listener and Provider connection settings", () => {
        expect(readRuntimeEnv(validEnv())).toEqual({
            MODE: "PROD",
            CMS_EDGE_RESPONSE_CACHE: true,
            CMS_CSP_ALLOWED_ORIGINS: { connectExtras: [], mediaExtras: [] },
            CMS_PORT: 3000,
            CMS_HOST: "0.0.0.0",
            CMS_EDGE_MAX_CONTEXTS: 16,
            CMS_HOSTING_PROVIDER_URL: "http://127.0.0.1:5103",
            CMS_HOSTING_EDGE_SECRET: "opaque-ulvia-edge-routing-key-material",
        });
    });

    test("validates listener and Provider credentials", () => {
        expect(() => parsePort("65536", "CMS_PORT", 3000)).toThrow(/between 1 and 65535/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_HOST: "bad host" })).toThrow(/hostname or IP/);
        expect(() => readRuntimeEnv({ ...validEnv(), CMS_HOSTING_EDGE_SECRET: "invalid" })).toThrow(
            /Invalid provider token/,
        );
    });
});
