import { expect } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { mcpContainers } from "../../integration/instance/containers";
import { connectBrowser } from "../../integration/instance/oauth";
import { networkPreloadSource } from "../../integration/instance/performance/network-preload";
import { publishPerformancePages } from "../../integration/instance/performance/journey";
import { requestWork } from "../../integration/instance/performance/request-work";
import { Cleanup } from "../harness/execution/cleanup";
import { RESOURCE_LIMITS, verifyImage } from "../harness/measurements/provenance";
import { beginSupplementary, writeSupplementary } from "../reporting/storage/supplementary";
import { docker } from "../../integration/instance/docker";
import { publicReader } from "./client/reader";
import { summarize } from "./evidence/summary";
import { observeContainer } from "./evidence/containers";
import { latencyScenario } from "./scenarios/latencies";
import { correctnessScenario } from "./scenarios/correctness";
import type { Finding, Sample } from "./evidence/summary";
import type { Context } from "./evidence/context";
import type { CacheOptions, ScenarioId } from "./plan";

export async function publicCacheJourney(options: CacheOptions, images: { edge: string; provider: string }) {
    const preloadSource = networkPreloadSource();
    const start = await beginSupplementary("delivery", {
        benchmark: "public-cache-v1",
        collectionProfile: "stable-series-batched-work-v1",
        options,
        transport:
            "Anonymous loopback HTTP/1.1 keep-alive through TCP relay, real Edge/Gateway/Provider/Mongo; no TLS or Caddy",
        instrumentationDigest: createHash("sha256").update(preloadSource).digest("hex"),
        resourceLimits: RESOURCE_LIMITS,
        limitations:
            "Shared development host; cold means process/context cold, never OS or Mongo page-cache cold. Readiness and waits excluded. No capability coverage credit.",
    });
    const cleanup = new Cleanup();
    const samples: Sample[] = [];
    const findings: Finding[] = [];
    const epochs: unknown[] = [];
    const bodies: Record<string, string> = {};
    const outcomes: { scenario: ScenarioId; completed: boolean }[] = [];
    const progress = resolve("artifacts/performance/public-cache-progress", `${start.metadata.id}.json`);
    const checkpoint = async () => {
        await mkdir(resolve(progress, ".."), { recursive: true });
        await writeFile(
            progress,
            JSON.stringify({ id: start.metadata.id, complete: false, samples, findings, outcomes, epochs, bodies }),
            { mode: 0o600 },
        );
    };
    let identities: unknown[] = [];
    try {
        await checkpoint();
        identities = await Promise.all(
            (["edge", "provider"] as const).map(async (component) =>
                verifyImage(
                    JSON.parse((await docker(["image", "inspect", images[component]])).stdout),
                    component,
                    images[component],
                    start.metadata.revision,
                ),
            ),
        );
        const temporary = await mkdtemp(join(tmpdir(), "ulvia-public-cache-"));
        cleanup.add("instrumentation", () => rm(temporary, { recursive: true, force: true }));
        const preload = join(temporary, "fetch.ts");
        await writeFile(preload, preloadSource);
        const stack = await mcpContainers(images, undefined, preload, true, {
            ...RESOURCE_LIMITS,
            "edge-replica": RESOURCE_LIMITS.edge,
        });
        cleanup.add("disposable stack", stack.close);
        const connection = await connectBrowser(stack.cmsUrl, stack.administrator);
        cleanup.add("authentication browser", () => connection.browser.close());
        await publishPerformancePages(connection);
        const reader = publicReader(stack.cmsUrl);
        cleanup.add("HTTP reader", async () => reader.close());
        const deferred: Sample[] = [];
        const context: Context = {
            stack,
            connection,
            reader,
            options,
            findings,
            epochs,
            flushWork: async () => {
                const batch = deferred.splice(0);
                if (!batch.length) {
                    return;
                }
                const work = await requestWork(
                    stack.providerName,
                    stack.edgeName,
                    batch.map((row) => row.requestId),
                    false,
                    true,
                );
                for (const row of batch) {
                    const own = work.byRequest?.[row.requestId];
                    if (!own) {
                        throw new Error("Missing request work evidence");
                    }
                    row.work = { requests: own, other: work.other };
                }
                await checkpoint();
            },
            sample: async (
                scenario,
                phase,
                epoch,
                measured = true,
                path = "/performance-literal",
                headers = {},
                replica,
            ) => {
                const client = replica?.reader ?? reader;
                const row: Sample = { ...(await client.read(path, headers)), scenario, phase, epoch, measured };
                samples.push(row);
                Object.assign(bodies, client.bodies);
                await checkpoint();
                if (measured && phase === "request") {
                    deferred.push(row);
                    return row;
                }
                row.work = await requestWork(stack.providerName, replica?.name ?? stack.edgeName, [row.requestId]);
                await checkpoint();
                return row;
            },
        };
        epochs.push({
            phase: "prepared",
            edge: await observeContainer(stack.edgeName),
            provider: await observeContainer(stack.providerName),
        });
        for (const scenario of options.scenarios) {
            console.log(`Public cache: ${scenario}`);
            const outcome = { scenario, completed: false };
            outcomes.push(outcome);
            try {
                if (
                    !["public.write-invalidation", "public.styles-after-restart", "public.private-response"].includes(
                        scenario,
                    )
                ) {
                    await latencyScenario(context, scenario);
                } else {
                    await correctnessScenario(context, scenario);
                }
                outcome.completed = true;
            } catch {
                findings.push({
                    scenario,
                    code: "scenario-failed",
                    detail: "Scenario assertion or preparation failed; retained samples are not discarded",
                });
            }
            epochs.push({
                phase: scenario,
                edge: await observeContainer(stack.edgeName),
                provider: await observeContainer(stack.providerName),
            });
            await checkpoint();
        }
    } catch {
        findings.push({
            scenario: "preparation",
            code: "journey-failed",
            detail: "Fixture or evidence collection failed",
        });
    } finally {
        for (const finding of await cleanup.close()) {
            findings.push({ scenario: "cleanup", code: finding.code, detail: finding.message });
        }
        await checkpoint();
    }
    const status =
        findings.length || outcomes.length !== options.scenarios.length || outcomes.some((row) => !row.completed)
            ? "failed"
            : "passed";
    const path = await writeSupplementary(
        start,
        { summary: summarize(samples), findings, options, outcomes, images: identities, epochs, samples, bodies },
        status,
    );
    console.log(`Public cache report: ${path}`);
    expect(status, `See retained report: ${path}`).toBe("passed");
    return path;
}
