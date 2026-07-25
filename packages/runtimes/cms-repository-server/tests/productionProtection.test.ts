import { describe, expect, test } from "bun:test";
import { productionPackageDownloadProtection } from "../src/production";
import { readRepositoryRuntimeEnv } from "../src/runtimeEnv";

describe("production package download protection", () => {
    test("keeps an explicit disabled fallback without a misleading global limiter", () => {
        const protection = productionPackageDownloadProtection(readRepositoryRuntimeEnv({}));

        expect(protection).toEqual({ clientAddressPolicy: { mode: "disabled" } });
        expect(protection.rateLimiter).toBeUndefined();
    });

    test("uses the shared trusted-proxy policy and configured in-memory budget", async () => {
        const protection = productionPackageDownloadProtection(
            readRepositoryRuntimeEnv({
                CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
                CMS_HTTP_TRUSTED_PROXY_HOPS: "2",
                CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: "1",
                CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: "45",
            }),
        );

        expect(protection.clientAddressPolicy).toEqual({ mode: "trusted-proxy", trustedProxyHops: 2 });
        expect((await protection.rateLimiter!.hit("repository-package-download:203.0.113.10")).allowed).toBe(true);
        expect((await protection.rateLimiter!.hit("repository-package-download:203.0.113.10")).allowed).toBe(false);
        expect((await protection.rateLimiter!.hit("repository-package-download:203.0.113.11")).allowed).toBe(true);
    });
});
