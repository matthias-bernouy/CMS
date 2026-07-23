import { executeFunction } from "@bernouy/cms-functions";
import type { ScheduledTriggerClaim } from "../../../interfaces/ScheduledTrigger";
import type { TriggerLastRun } from "../../../interfaces/TriggerDefinition";
import { resolveScheduledValue } from "./references";
import type { ScheduledTriggerRunResult, ScheduledTriggerRunnerOptions } from "./types";

export async function executeScheduledClaim(
    options: ScheduledTriggerRunnerOptions,
    claim: ScheduledTriggerClaim,
): Promise<ScheduledTriggerRunResult> {
    const now = options.now ?? (() => new Date());
    const startedMs = now().getTime();
    let outcome: ExecutionOutcome;
    try {
        outcome = await executeTarget(options, claim);
    } catch (error) {
        outcome = { ok: false, error: message(error) };
    }
    const finishedAt = now().toISOString();
    const durationMs = Math.max(0, now().getTime() - startedMs);
    const lastRun: TriggerLastRun = {
        at: finishedAt,
        status: outcome.ok ? "ok" : "error",
        runId: claim.runId,
        scheduledAt: claim.scheduledAt,
        durationMs,
        ...(outcome.responseStatus !== undefined ? { responseStatus: outcome.responseStatus } : {}),
        ...(!outcome.ok ? { error: outcome.error.slice(0, 1_000) } : {}),
    };
    const completed = await options.triggers.completeScheduledTrigger({
        triggerId: claim.trigger.id,
        token: claim.token,
        owner: claim.owner,
        finishedAt,
        lastRun,
    });
    if (!completed) {
        return result(claim, "lost_claim", durationMs, outcome.responseStatus);
    }
    const status = outcome.ok ? "succeeded" : (outcome.status ?? "failed");
    log(options, claim.trigger.id, status, durationMs);
    return result(claim, status, durationMs, outcome.responseStatus);
}

type ExecutionOutcome =
    | { ok: true; responseStatus: number }
    | { ok: false; error: string; responseStatus?: number; status?: "missing" | "invalid" | "failed" };

async function executeTarget(
    options: ScheduledTriggerRunnerOptions,
    claim: ScheduledTriggerClaim,
): Promise<ExecutionOutcome> {
    const timeoutMs = claim.trigger.event.kind === "schedule" ? (claim.trigger.event.timeoutMs ?? 120_000) : 120_000;
    const controller = new AbortController();
    const execution = claim.trigger.function
        ? executeFunctionTarget(options, claim, controller.signal)
        : executeTaskTarget(options, claim, controller.signal);
    return withTimeout(execution, timeoutMs, controller);
}

async function executeFunctionTarget(
    options: ScheduledTriggerRunnerOptions,
    claim: ScheduledTriggerClaim,
    signal: AbortSignal,
): Promise<ExecutionOutcome> {
    const target = claim.trigger.function!;
    const fn = await options.functions.getFunction(target.id);
    if (!fn) {
        return { ok: false, status: "missing", error: `function not found: ${target.id}` };
    }
    if (fn.method !== "POST" || fn.access?.mode !== "system") {
        return { ok: false, status: "invalid", error: `function ${target.id} must be a system POST function` };
    }
    const url = new URL("https://cms.internal/scheduled-trigger");
    for (const [key, value] of Object.entries(target.params ?? {})) {
        const resolved = resolveScheduledValue(value, claim);
        if (resolved !== undefined && resolved !== null && resolved !== "") {
            url.searchParams.set(key, String(resolved));
        }
    }
    const body = resolveScheduledValue(target.body, claim);
    const response = await executeFunction(
        fn,
        new Request(url, {
            method: "POST",
            signal,
            headers: body === undefined ? undefined : { "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        { sources: options.sources, deps: options.deps, identities: options.deps?.identities, user: {} },
    );
    return responseOutcome(response);
}

async function executeTaskTarget(
    options: ScheduledTriggerRunnerOptions,
    claim: ScheduledTriggerClaim,
    signal: AbortSignal,
): Promise<ExecutionOutcome> {
    const target = claim.trigger.task;
    if (!target) {
        return { ok: false, status: "invalid", error: "scheduled trigger target is unavailable" };
    }
    const handler = options.tasks?.get(target.id);
    if (!handler) {
        return { ok: false, status: "missing", error: `scheduled task not found: ${target.id}` };
    }
    return responseOutcome(
        await handler(resolveScheduledValue(target.body, claim), {
            triggerId: claim.trigger.id,
            runId: claim.runId,
            runKey: claim.runKey,
            scheduledAt: claim.scheduledAt,
            startedAt: claim.startedAt,
            signal,
        }),
    );
}

async function responseOutcome(response: Response): Promise<ExecutionOutcome> {
    if (response.ok) {
        return { ok: true, responseStatus: response.status };
    }
    const error = (await response.text().catch(() => "")).trim();
    return {
        ok: false,
        status: "failed",
        responseStatus: response.status,
        error: error || `target returned ${response.status}`,
    };
}

async function withTimeout(
    execution: Promise<ExecutionOutcome>,
    timeoutMs: number,
    controller: AbortController,
): Promise<ExecutionOutcome> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            execution,
            new Promise<ExecutionOutcome>((resolve) => {
                timer = setTimeout(() => {
                    controller.abort();
                    resolve({ ok: false, status: "failed", error: `scheduled trigger timed out after ${timeoutMs}ms` });
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

function result(
    claim: ScheduledTriggerClaim,
    status: ScheduledTriggerRunResult["status"],
    durationMs: number,
    responseStatus?: number,
): ScheduledTriggerRunResult {
    return {
        triggerId: claim.trigger.id,
        runId: claim.runId,
        status,
        ...(responseStatus !== undefined ? { responseStatus } : {}),
        durationMs,
    };
}

function log(options: ScheduledTriggerRunnerOptions, id: string, status: string, durationMs: number): void {
    const message = `[cms-triggers] scheduled trigger ${id} ${status} (${durationMs}ms)`;
    (status === "succeeded" ? options.logger?.info : options.logger?.error)?.(message);
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
