import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { BunRunner } from "@bernouy/http-runner";
import { DefaultProviderCapabilityDispatcher, mountOperatorCapabilities } from "@bernouy/ulvia-provider";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { UlviaProviderInstanceRuntime } from "@bernouy/ulvia-provider";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
import { instrumentPublicBinding } from "../../../harness/instrumentation/public";
import { instrumentDispatcher } from "../../../harness/instrumentation/dispatch";
import { traceFile } from "../../../harness/instrumentation/records";

class OperatorRunner extends BunRunner {}
class OperatorDispatcher extends DefaultProviderCapabilityDispatcher {
    override seal(...args: Parameters<DefaultProviderCapabilityDispatcher["seal"]>) {
        return super.seal(...args);
    }
    override invoke(...args: Parameters<DefaultProviderCapabilityDispatcher["invoke"]>) {
        return super.invoke(...args);
    }
}
instrumentPublicBinding(OperatorRunner.prototype);
instrumentDispatcher(OperatorDispatcher.prototype);

test("operator performance traces correlate admitted dispatch without forwarding caller identity", async () => {
    const compiled = await compileOfficialFeatures();
    const contract = compiled.implementedContracts.find((row) => row.release.contractId === "ulvia/cluster.logs")!;
    const pin = { contractId: contract.release.contractId, version: contract.release.version, digest: contract.digest };
    const dispatcher = new OperatorDispatcher([contract]);
    await registerOfficialFeatures(
        dispatcher,
        {
            clusterLogs: {
                query: async () => ({
                    items: [],
                    nextCursor: null,
                    from: "2026-11-21T10:00:00.000Z",
                    to: "2026-11-21T11:00:00.000Z",
                    sources: [{ instanceId: "instance:a", status: "available" }],
                    partial: false,
                }),
                get: async () => {
                    throw new Error("Not called");
                },
                aggregate: async () => {
                    throw new Error("Not called");
                },
                latency: async () => {
                    throw new Error("Not called");
                },
            },
        },
        [pin],
        { providerId: "performance/operator", scope: { siteId: "cluster-logs", instanceId: "instance:cluster-logs" } },
    );
    const runtime: UlviaProviderInstanceRuntime = {
        siteId: "cluster-logs",
        contracts: [contract],
        dispatcher,
        report: {
            protocol: "ulvia-provider/v1",
            providerId: "performance/operator",
            instanceId: "instance:cluster-logs",
            account: { id: "instance:cluster-logs", label: "Operator fixture" },
            buildVersion: "1.0.0",
            manifest: { version: "1.0.0", digest: `sha256:${"a".repeat(64)}` as ProviderManifestDigest },
            implementations: [{ ...pin, status: "ready" }],
        },
    };
    const token = "private-operator-test-credential-at-least-32-characters";
    const runner = new OperatorRunner();
    mountOperatorCapabilities(runner, runtime, token);
    const trace = crypto.randomUUID();
    try {
        const response = await runner.handle(
            new Request("http://provider/ulvia/operator/logs/query", {
                method: "QUERY",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${token}`,
                    "x-request-id": trace,
                    "x-ulvia-instance-id": "forged-instance",
                    "x-ulvia-request-id": "forged-request",
                },
                body: JSON.stringify({ instanceIds: ["instance:a"] }),
            }),
        );
        expect(response.status).toBe(200);
        await response.json();
        const text = await readFile(traceFile(trace), "utf8");
        expect(JSON.parse(text.trim())).toMatchObject({
            kind: "capability",
            traceId: trace,
            success: true,
            target: `${pin.contractId}@${pin.version}#${pin.digest}:logs.query`,
            binding: "http",
        });
        expect(text).not.toContain("forged");
        expect(text).not.toContain(token);
    } finally {
        await Bun.file(traceFile(trace)).delete();
    }
});
