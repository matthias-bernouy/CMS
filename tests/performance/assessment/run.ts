import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { mcpContainers } from "../../integration/instance/containers";
import { docker } from "../../integration/instance/docker";
import { connectBrowser } from "../../integration/instance/oauth";
import { repositoryApi } from "../../integration/instance/repository/client";
import { officialCapabilityInventory, scopedInventory } from "../capabilities/inventory";
import { buildProbe } from "../harness/docker/probe";
import { startProfiler } from "../harness/docker/profiler";
import {
    environmentProfile,
    RESOURCE_LIMITS,
    runId,
    sourceProvenance,
    verifyImage,
} from "../harness/measurements/provenance";
import { assessmentScenarios } from "../scenarios/plan";
import { assessmentReport } from "./report";
import type { Finding, ScenarioResult } from "../capabilities/types";
import { Cleanup } from "../harness/execution/cleanup";
import { scenarioClient } from "../harness/clients/session";

export async function assessCapabilities(
    images: { edge: string; provider: string },
    referenceId?: string,
    select = assessmentScenarios,
    scope?: { contractId: string; capabilityId: string },
) {
    const startedAt = new Date().toISOString();
    const source = await sourceProvenance();
    const identities = await Promise.all(
        (["edge", "provider"] as const).map(async (component) =>
            verifyImage(
                JSON.parse((await docker(["image", "inspect", images[component]])).stdout),
                component,
                images[component],
                source.revision,
            ),
        ),
    );
    const fullInventory = await officialCapabilityInventory();
    const inventory = scope ? scopedInventory(fullInventory, scope) : fullInventory;
    const fixtureHash = createHash("sha256");
    const paths = [
        ...new Bun.Glob("tests/integration/instance/**/*.ts").scanSync({ cwd: resolve(import.meta.dir, "../../..") }),
        ...new Bun.Glob("tests/performance/scenarios/**/*.ts").scanSync({ cwd: resolve(import.meta.dir, "../../..") }),
        ...new Bun.Glob("tests/performance/harness/**/*.ts").scanSync({ cwd: resolve(import.meta.dir, "../../..") }),
        ...new Bun.Glob("tests/performance/fixtures/**/*").scanSync({
            cwd: resolve(import.meta.dir, "../../.."),
            onlyFiles: true,
        }),
        ...new Bun.Glob("tests/performance/assessment/**/*.ts").scanSync({ cwd: resolve(import.meta.dir, "../../..") }),
    ].toSorted();
    for (const path of paths) {
        fixtureHash.update(path).update(new Uint8Array(await Bun.file(path).arrayBuffer()));
    }
    const fixture = fixtureHash.digest("hex");
    const scenarios = select(inventory, fixture);
    const probe = await buildProbe();
    const cleanup = new Cleanup();
    cleanup.add("instrumentation bundle", probe.close);
    const profile = environmentProfile(probe.digest);
    const results: ScenarioResult[] = [];
    const findings: Finding[] = [];
    let stack: Awaited<ReturnType<typeof mcpContainers>> | undefined;
    let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
    try {
        stack = await mcpContainers(images, undefined, probe.path, undefined, RESOURCE_LIMITS);
        cleanup.add("isolated Docker stack", stack.close);
        const session = await repositoryApi(stack.cmsUrl).session(
            stack.administrator.email,
            stack.administrator.password,
        );
        connection = await connectBrowser(stack.cmsUrl, stack.administrator);
        const browser = connection.browser;
        cleanup.add("MCP authentication browser", () => browser.close());
        await startProfiler(stack.id);
        const activeStack = stack;
        const environment = {
            stack: {
                id: stack.id,
                providerName: stack.providerName,
                edgeName: stack.edgeName,
                instanceId: stack.instanceId,
                createPendingSite: stack.createPendingSite,
                restartProvider: () => activeStack.restartProvider(1),
            },
            main: {
                origin: stack.cmsUrl,
                cookie: session.cookie,
                subjectId: session.accountId,
                token: connection.token.access_token,
                tools: connection.tools,
            },
            registry: {
                origin: stack.repositoryUrl,
                cookie: stack.repository.account.cookie,
                subjectId: stack.repository.account.accountId,
            },
        };
        const authoring = await scenarioClient(fullInventory, environment.main)(
            "ulvia/cms.authoring",
            "configure-connection",
            "http",
            { token: stack.repository.pat.token },
        );
        if (!authoring.observation.validated) {
            throw new Error("Could not prepare the isolated authoring connection");
        }
        for (const scenario of scenarios) {
            const result = await scenario.execute(environment);
            results.push(result);
            console.log(`${result.status} ${result.scenario}${result.failure ? `: ${result.failure}` : ""}`);
        }
    } catch {
        findings.push({
            code: "assessment-fixture-failed",
            message: "The isolated stack or authenticated MCP fixture could not be prepared",
        });
    } finally {
        findings.push(...(await cleanup.close()));
    }
    const finishedSource = await sourceProvenance();
    if (finishedSource.sourceDigest !== source.sourceDigest) {
        findings.push({
            code: "source-changed-during-run",
            message:
                "The working tree changed during measurement; this run is diagnostic evidence and cannot be promoted as a stable reference",
        });
    }
    const artifact = await assessmentReport(
        resolve("artifacts/performance/runs"),
        {
            id: runId(source.revision),
            startedAt,
            finishedAt: new Date().toISOString(),
            ...source,
            profile,
            images: identities,
        },
        inventory,
        scenarios.map((scenario) => scenario.definition),
        results,
        findings,
        referenceId,
    );
    console.log(
        JSON.stringify({
            path: artifact.path,
            status: artifact.report.status,
            scenarios: results.length,
            passed: results.filter((result) => result.status === "passed").length,
            covered: artifact.report.coverage.filter((row) => row.status === "covered").length,
            required: artifact.report.coverage.length,
        }),
    );
    return artifact;
}

if (import.meta.main) {
    const version = Bun.argv[2] ?? "0.1.0-capability-assessment";
    const result = await assessCapabilities(
        { edge: `cyaxis/ulvia-edge:${version}`, provider: `cyaxis/ulvia-provider:${version}` },
        Bun.argv[3] ?? process.env.ULVIA_PERFORMANCE_REFERENCE,
    );
    if (result.report.status !== "passed") {
        process.exitCode = 1;
    }
}
