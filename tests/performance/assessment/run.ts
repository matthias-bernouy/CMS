import { resolve } from "node:path";
import { mcpContainers } from "../../integration/instance/containers";
import { DeploymentPreparationError } from "../../integration/instance/containers/deployment";
import { connectBrowser } from "../../integration/instance/oauth";
import { repositoryApi } from "../../integration/instance/repository/client";
import { buildProbe } from "../harness/docker/probe";
import { startProfiler } from "../harness/docker/profiler";
import { runtimeStateFindings } from "../harness/docker/runtime-state";
import { environmentProfile, RESOURCE_LIMITS, runId, sourceProvenance } from "../harness/measurements/provenance";
import { assessmentScenarios } from "../scenarios/plan";
import { assessmentReport } from "./report";
import type { Finding, ScenarioResult } from "../capabilities/types";
import { Cleanup } from "../harness/execution/cleanup";
import { scenarioClient } from "../harness/clients/session";
import { executeScenarios } from "../harness/execution/assessment";
import { assessmentEnvironment } from "../harness/execution/environment";
import { createCheckpoint } from "../reporting/storage/checkpoint";
import { startControlledServices } from "../harness/services/controlled";
import { prepareAssessment } from "./preparation";
import type { AssessmentScope } from "./preparation";

export async function assessCapabilities(
    images: { edge: string; provider: string },
    referenceId?: string,
    select = assessmentScenarios,
    scope?: AssessmentScope,
    conditions?: Readonly<{ sharedHostDevelopment: boolean; scenarioIds?: readonly string[] }>,
) {
    const startedAt = new Date().toISOString();
    const {
        source,
        sourceArchive,
        identities,
        fullInventory,
        inventory,
        scenarios,
        selection,
        programs,
        executionImages,
    } = await prepareAssessment(images, select, scope, conditions?.scenarioIds);
    const probe = await buildProbe();
    const cleanup = new Cleanup();
    cleanup.add("instrumentation bundle", probe.close);
    const profile = environmentProfile(probe.digest, programs.profiles);
    const id = runId(source.revision);
    const metadata = {
        id,
        startedAt,
        ...source,
        sourceArchive,
        profile,
        images: identities,
        ...(selection ? { selection } : {}),
    };
    const checkpoint = await createCheckpoint(resolve("artifacts/performance/checkpoints"), {
        metadata,
        inventory,
        scenarios: scenarios.map((scenario) => scenario.definition),
    }).catch(async (error) => {
        await cleanup.close();
        throw error;
    });
    console.log(`Performance checkpoints: ${checkpoint.directory}`);
    const results: ScenarioResult[] = [];
    const findings: Finding[] = [];
    if (conditions?.sharedHostDevelopment) {
        findings.push({
            code: "measurement-contaminated",
            message:
                "Development work shares this host; retain diagnostic results without using them as a timing regression reference",
        });
    }
    let stack: Awaited<ReturnType<typeof mcpContainers>> | undefined;
    let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
    let services: Awaited<ReturnType<typeof startControlledServices>> | undefined;
    try {
        stack = await mcpContainers(
            executionImages,
            undefined,
            probe.path,
            undefined,
            RESOURCE_LIMITS,
            programs.profiles
                ? async (cluster) => {
                      services = await startControlledServices(cluster, executionImages, programs);
                      cleanup.add("controlled service files", services.close);
                      return services.providerOptions;
                  }
                : undefined,
        );
        cleanup.add("isolated Docker stack", stack.close);
        const session = await repositoryApi(stack.cmsUrl).session(
            stack.administrator.email,
            stack.administrator.password,
        );
        connection = await connectBrowser(stack.cmsUrl, stack.administrator);
        const browser = connection.browser;
        cleanup.add("MCP authentication browser", () => browser.close());
        await startProfiler(stack.id);
        const { environment, prepare } = assessmentEnvironment(
            stack,
            connection,
            session,
            inventory,
            services?.dns,
            services?.smtp,
            services?.tls,
        );
        const authoring = await scenarioClient(fullInventory, environment.main)(
            "ulvia/cms.authoring",
            "configure-connection",
            "http",
            { token: stack.repository.pat.token },
        );
        if (!authoring.observation.validated) {
            throw new Error("Could not prepare the isolated authoring connection");
        }
        await executeScenarios(
            scenarios,
            environment,
            async (result) => {
                await checkpoint.record(result);
                results.push(result);
                console.log(`${result.status} ${result.scenario}${result.failure ? `: ${result.failure}` : ""}`);
            },
            prepare,
        );
    } catch (error) {
        findings.push({
            code: "assessment-fixture-failed",
            message:
                error instanceof DeploymentPreparationError
                    ? error.message
                    : "The isolated stack or authenticated MCP fixture could not be prepared",
        });
    } finally {
        if (stack) {
            findings.push(
                ...(await runtimeStateFindings({
                    id: stack.id,
                    providerName: stack.providerName,
                    edgeName: stack.edgeName,
                })),
            );
        }
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
        { ...metadata, finishedAt: new Date().toISOString() },
        inventory,
        scenarios.map((scenario) => scenario.definition),
        results,
        findings,
        referenceId,
    );
    await checkpoint.close(artifact.report.status);
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
    const diagnostic = process.env.ULVIA_PERFORMANCE_DIAGNOSTIC;
    if (diagnostic !== undefined && !["0", "1"].includes(diagnostic)) {
        throw new Error("ULVIA_PERFORMANCE_DIAGNOSTIC must be 0 or 1");
    }
    const result = await assessCapabilities(
        { edge: `cyaxis/ulvia-edge:${version}`, provider: `cyaxis/ulvia-provider:${version}` },
        Bun.argv[3] ?? process.env.ULVIA_PERFORMANCE_REFERENCE,
        undefined,
        undefined,
        { sharedHostDevelopment: diagnostic === "1" },
    );
    if (result.report.status !== "passed") {
        process.exitCode = 1;
    }
}
