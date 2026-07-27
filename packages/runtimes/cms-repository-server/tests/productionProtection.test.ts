import { describe, expect, test } from "bun:test";
import { resolveClientAddress, setRequestIP } from "@bernouy/http-runner";
import { createProductionRepositoryOperationalTelemetry, productionPackageDownloadProtection } from "../src/production";
import { readRepositoryRuntimeEnv } from "../src/runtimeEnv";

describe("production package download protection", () => {
    test("does not reject an internal CMS request without X-Forwarded-For", () => {
        const protection = productionPackageDownloadProtection(readRepositoryRuntimeEnv({}));
        const request = new Request("http://cms-repository/.cms/repository/api/integrations/package");
        setRequestIP(request, "10.0.0.12");

        expect(protection).toEqual({ clientAddressPolicy: { mode: "disabled" } });
        expect(protection.rateLimiter).toBeUndefined();
        expect(resolveClientAddress(request, protection.clientAddressPolicy)).toBeUndefined();
    });

    test("uses the shared trusted-proxy policy and configured in-memory budget", async () => {
        const observations: unknown[] = [];
        const protection = productionPackageDownloadProtection(
            readRepositoryRuntimeEnv({
                CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
                CMS_HTTP_TRUSTED_PROXY_HOPS: "2",
                CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: "1",
                CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: "45",
            }),
            (observation) => observations.push(observation),
        );

        expect(protection.clientAddressPolicy).toEqual({ mode: "trusted-proxy", trustedProxyHops: 2 });
        expect((await protection.rateLimiter!.hit("repository-package-download:203.0.113.10")).allowed).toBe(true);
        expect((await protection.rateLimiter!.hit("repository-package-download:203.0.113.10")).allowed).toBe(false);
        expect((await protection.rateLimiter!.hit("repository-package-download:203.0.113.11")).allowed).toBe(true);
        protection.observe?.({ outcome: "served", resource: "package", bytes: 4_096 });
        expect(observations).toEqual([{ outcome: "served", resource: "package", bytes: 4_096 }]);
    });

    test("writes completed repository operations as structured JSON", () => {
        const lines: string[] = [];
        const telemetry = createProductionRepositoryOperationalTelemetry((line) => lines.push(line));
        const span = telemetry.start("stable-promotion", {
            kind: "demo",
            version: "1.0.0",
            digest: "a".repeat(64),
        });

        telemetry.finish(span, "succeeded", { operationId: "promotion-operation" });

        expect(JSON.parse(lines[0]!)).toMatchObject({
            schema: "cms.repository.operation.v1",
            operation: "stable-promotion",
            operationId: "promotion-operation",
            kind: "demo",
            version: "1.0.0",
            digest: "a".repeat(64),
            outcome: "succeeded",
        });
    });
});
