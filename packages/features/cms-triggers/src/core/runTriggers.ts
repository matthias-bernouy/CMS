import type {
    FunctionRepository,
    FunctionUserContext,
} from "@bernouy/cms-functions";
import type { ExecutorDeps, SourceEndpoint, SourceRepository } from "@bernouy/cms-sources";
import type { TriggerEventPhase, TriggerFailureMode, TriggerRecord } from "../interfaces/TriggerDefinition";
import type { TriggerRepository } from "../interfaces/TriggerRepository";
import { runOneTrigger } from "./runtime/runOneTrigger";

export type RunTriggersOptions = {
    triggers: TriggerRepository;
    records: readonly TriggerRecord[];
    functions: FunctionRepository;
    sources: SourceRepository;
    deps?: ExecutorDeps;
    endpoint: SourceEndpoint;
    phase: TriggerEventPhase;
    request: Request;
    requestBody?: unknown;
    responseStatus?: number;
    responseBody?: unknown;
    user?: FunctionUserContext;
    timeoutMs?: number;
};

export type RunTriggersResult = {
    blocked: boolean;
    response?: Response;
};

export async function runTriggers(options: RunTriggersOptions): Promise<RunTriggersResult> {
    for (const trigger of options.records) {
        const mode = trigger.mode ?? "async";
        if (mode === "async") {
            void runOneTrigger(trigger, options).catch(() => undefined);
            continue;
        }

        const outcome = await runOneTrigger(trigger, options);
        if (!outcome.ok && effectiveFailureMode(trigger, options.phase) === "block") {
            return { blocked: true, response: triggerFailureResponse(trigger, outcome.error) };
        }
    }

    return { blocked: false };
}

export function effectiveFailureMode(trigger: TriggerRecord, phase: TriggerEventPhase): TriggerFailureMode {
    if (trigger.mode === "async") return "ignore";
    if (trigger.failureMode) return trigger.failureMode;
    return phase === "request" ? "block" : "ignore";
}

function triggerFailureResponse(trigger: TriggerRecord, error: string): Response {
    return new Response(JSON.stringify({
        error: "Trigger failed",
        trigger: trigger.id,
        detail: error,
    }), {
        status: 502,
        headers: { "content-type": "application/json" },
    });
}
