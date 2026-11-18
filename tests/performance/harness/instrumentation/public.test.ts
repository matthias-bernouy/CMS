import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { BunRunner } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { DefaultProviderCapabilityDispatcher, mountPublicCapabilities } from "@bernouy/ulvia-provider";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { instrumentPublicBinding } from "./public";
import { instrumentDispatcher } from "./dispatch";
import { scope, traceFile } from "./records";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
import type { UlviaProviderInstanceRuntime } from "@bernouy/ulvia-provider";

class TestRunner extends BunRunner {
    override get(...args: Parameters<BunRunner["get"]>) {
        return super.get(...args);
    }
}
class TestDispatcher extends DefaultProviderCapabilityDispatcher {
    override seal(...args: Parameters<DefaultProviderCapabilityDispatcher["seal"]>) {
        return super.seal(...args);
    }
    override invoke(...args: Parameters<DefaultProviderCapabilityDispatcher["invoke"]>) {
        return super.invoke(...args);
    }
}
instrumentPublicBinding(TestRunner.prototype);
instrumentDispatcher(TestDispatcher.prototype);

test("public TLS correlation observes real admitted execution while preserving server-generated scope and concurrent trace isolation", async () => {
    const compiled = await compileOfficialFeatures();
    const contract = compiled.implementedContracts.find((row) => row.release.contractId === "ulvia/provider.tls")!;
    const dispatcher = new TestDispatcher([contract]);
    const pin = { contractId: contract.release.contractId, version: contract.release.version, digest: contract.digest };
    let fail = false;
    await registerOfficialFeatures(
        dispatcher,
        {
            hostingTls: {
                async permit(hostname) {
                    expect(hostname).toBe("sample.performance.test");
                    await Bun.sleep(1);
                    if (fail) {
                        throw new Error("private fixture failure");
                    }
                },
            },
        },
        [pin],
        { providerId: "performance/tls", scope: { siteId: "hosting", instanceId: "hosting:tls" } },
    );
    const runtime: UlviaProviderInstanceRuntime = {
        siteId: "hosting",
        contracts: [contract],
        dispatcher,
        report: {
            protocol: "ulvia-provider/v1",
            providerId: "performance/tls",
            instanceId: "hosting:tls",
            account: { id: "hosting:tls", label: "TLS fixture" },
            buildVersion: "1.0.0",
            manifest: { version: "1.0.0", digest: `sha256:${"a".repeat(64)}` as ProviderManifestDigest },
            implementations: [{ ...pin, status: "ready" }],
        },
    };
    const runner = new TestRunner();
    mountPublicCapabilities(runner, runtime, NOOP_LOGGER);
    runner.get("/other", () => Response.json({ scoped: !!scope.getStore() }));
    const traces = Array.from({ length: 10 }, () => crypto.randomUUID());
    const request = (trace: string) =>
        runner.handle(
            new Request("http://provider/hosting/tls/permission?domain=sample.performance.test", {
                headers: {
                    "x-request-id": trace,
                    "x-ulvia-request-id": "forged-private-id",
                    authorization: "Bearer forged-secret",
                    "x-ulvia-instance-id": "instance:foreign",
                    "x-ulvia-contract-id": "ulvia/cms.hosting",
                },
            }),
        );
    try {
        await Promise.all(
            traces.map(async (trace) => {
                const response = await request(trace);
                expect(response.status).toBe(200);
                expect(await response.json()).toEqual({ permission: "allowed" });
                const text = await readFile(traceFile(trace), "utf8");
                const rows = text
                    .trim()
                    .split("\n")
                    .map((line) => JSON.parse(line));
                expect(rows).toHaveLength(1);
                expect(rows[0]).toMatchObject({
                    kind: "capability",
                    traceId: trace,
                    success: true,
                    target: `${pin.contractId}@${pin.version}#${pin.digest}:certificates.permit`,
                    binding: "http",
                });
                expect(rows[0].spanId).not.toBe(trace);
                expect(rows[0].spanId).toMatch(/^[a-f0-9-]{36}$/u);
                expect(text).not.toContain("forged");
            }),
        );
        const other = await runner.handle(
            new Request("http://provider/other", { headers: { "x-request-id": traces[0]! } }),
        );
        expect(await other.json()).toEqual({ scoped: false });
        fail = true;
        const trace = crypto.randomUUID();
        traces.push(trace);
        const response = await request(trace);
        expect(response.status).toBe(503);
        await response.arrayBuffer();
        const text = await readFile(traceFile(trace), "utf8");
        expect(JSON.parse(text.trim()).success).toBe(false);
        expect(text).not.toContain("private fixture failure");
    } finally {
        await Promise.all(traces.map((trace) => Bun.file(traceFile(trace)).delete()));
    }
});
