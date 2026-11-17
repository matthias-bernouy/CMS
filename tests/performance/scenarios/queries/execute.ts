import { observeHttp } from "../../harness/clients/http";
import { observeMcp } from "../../harness/clients/mcp";
import { measurements } from "../../harness/docker/collect";
import type { MeasuredStack } from "../../harness/docker/collect";
import type { ClientCall, McpTool } from "../../harness/clients/types";
import type { ScenarioResult } from "../../capabilities/types";
import { witnessed } from "../../capabilities/evidence";
import { measuredLoad } from "../../harness/measurements/load";
import { requireRecord } from "./types";
import type { QueryContext, QueryScenario } from "./types";

export type QueryEnvironment = Readonly<{
    stack: MeasuredStack &
        Readonly<{
            restartProvider: () => Promise<void>;
            instanceId: string;
            createPendingSite?: (
                alias: string,
            ) => Promise<
                Readonly<{ url: string; instanceId: string; administrator: { email: string; password: string } }>
            >;
        }>;
    main: Readonly<{ origin: string; cookie: string; token: string; subjectId: string; tools: readonly McpTool[] }>;
    registry: Readonly<{ origin: string; cookie: string; subjectId: string }>;
}>;

export async function executeQuery(scenario: QueryScenario, environment: QueryEnvironment): Promise<ScenarioResult> {
    const { definition, target, obligation, recipe } = scenario;
    const site = recipe.site === "registry" ? environment.registry : environment.main;
    const context: QueryContext = { subjectId: site.subjectId, collectionId: "ulvia.test/smoke-kit" };
    const call: ClientCall = {
        origin: site.origin,
        target,
        binding: obligation.binding,
        input: recipe.input?.(context) ?? {},
        credentials: obligation.binding === "mcp" ? { token: environment.main.token } : { cookie: site.cookie },
        assert: (output) => recipe.assert(requireRecord(output), context),
    };
    const send = () => (obligation.binding === "mcp" ? observeMcp(call, environment.main.tools) : observeHttp(call));
    const samples: Awaited<ReturnType<typeof send>>[] = [];
    const captured: Awaited<ReturnType<typeof measurements>> = [];
    let load: ScenarioResult["load"];
    try {
        if (obligation.variant === "warm") {
            const preparation = await Promise.all(Array.from({ length: 3 }, send));
            captured.push(
                ...(await measurements(environment.stack, definition.id, obligation, preparation, "preparation")),
            );
            if (preparation.some((sample) => !sample.validated)) {
                return {
                    scenario: definition.id,
                    status: "failed",
                    failure: "Warm-up could not produce a valid fixture result",
                    measurements: captured,
                };
            }
        }
        const started = performance.now();
        if (obligation.variant === "concurrent") {
            samples.push(...(await Promise.all(Array.from({ length: definition.samples }, send))));
        } else {
            for (let index = 0; index < definition.samples; index++) {
                samples.push(await send());
            }
        }
        if (definition.load) {
            load = measuredLoad(definition.load.concurrency, performance.now() - started, samples);
        }
        captured.push(...(await measurements(environment.stack, definition.id, obligation, samples)));
        const valid = captured.filter((sample) => sample.phase === "measurement").every(witnessed);
        const failures = [...new Set(samples.flatMap((sample) => (sample.failure ? [sample.failure] : [])))];
        return {
            scenario: definition.id,
            status: valid ? "passed" : "failed",
            ...(valid
                ? {}
                : { failure: failures.join(", ") || "Missing exact invocation witness or complete instrumentation" }),
            measurements: captured,
            ...(load ? { load } : {}),
        };
    } catch {
        return {
            scenario: definition.id,
            status: "blocked",
            failure: "Query fixture, binding or measurement collection failed",
            measurements: captured,
            ...(load ? { load } : {}),
        };
    }
}
