import { randomUUID } from "node:crypto";
import { mcpContainers } from "../../integration/instance/containers";
import { repositoryApi } from "../../integration/instance/repository/client";
import { officialCapabilityInventory } from "../capabilities/inventory";
import { buildProbe, readProbe } from "../harness/docker/probe";
import { collectMetrics } from "../harness/docker/metrics";
import { readProfile, startProfiler } from "../harness/docker/profiler";
import { capabilityRequest, responseBytes } from "../harness/transport/http";
import { RESOURCE_LIMITS } from "../harness/measurements/provenance";

/** A disposable real-stack check of the test instrumentation, never a coverage claim. */
export async function probeAssessment() {
    const probe = await buildProbe();
    let stack: Awaited<ReturnType<typeof mcpContainers>> | undefined;
    try {
        stack = await mcpContainers(
            {
                edge: "cyaxis/ulvia-edge:0.1.0-capability-assessment",
                provider: "cyaxis/ulvia-provider:0.1.0-capability-assessment",
            },
            undefined,
            probe.path,
            undefined,
            RESOURCE_LIMITS,
        );
        const session = await repositoryApi(stack.cmsUrl).session(
            stack.administrator.email,
            stack.administrator.password,
        );
        console.log(JSON.stringify({ stage: "stack-ready", id: stack.id, probe: probe.digest }));
        const databases = await startProfiler(stack.id);
        const inventory = await officialCapabilityInventory();
        const target = inventory.targets.find((row) => !row.retained && row.definition.id === "site.get");
        if (!target) {
            throw new Error("Current site.get implementation is missing");
        }
        const traceId = randomUUID();
        const request = capabilityRequest(stack.cmsUrl, target, "http", {}, session, traceId);
        const started = performance.now();
        const response = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(30_000) });
        const bytes = await responseBytes(response);
        const durationMs = performance.now() - started;
        const [provider, edge, profile, mounts] = await Promise.all([
            readProbe(stack.providerName, traceId),
            readProbe(stack.edgeName, traceId),
            readProfile(stack.id, [traceId]),
            readProbe(stack.providerName),
        ]);
        console.log(
            JSON.stringify({
                stage: "measurement",
                status: response.status,
                bytes: bytes.byteLength,
                durationMs,
                databases,
                metrics: collectMetrics(traceId, [...provider, ...edge], profile, true),
                kinds: [...provider, ...edge].map((row) => row.kind),
                profile,
                instrumentation: mounts.filter((row) => row.kind === "instrumentation"),
                mounted: mounts.filter((row) => row.kind === "mount").length,
            }),
        );
        if (!response.ok || !provider.some((row) => row.kind === "capability" && row.target === target.key)) {
            throw new Error("The probe did not witness the actual successful capability invocation");
        }
    } catch (error) {
        if (stack) {
            console.error(await stack.diagnostics());
        }
        throw error;
    } finally {
        await stack?.close();
        await probe.close();
    }
}

if (import.meta.main) {
    await probeAssessment();
}
