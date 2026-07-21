import {
    evaluateCondition,
    executeFunction,
    resolveFunctionValue,
    type ExecuteFunctionOptions,
} from "@bernouy/cms-functions";
import { resolveTriggerReference, triggerVars } from "../triggerRefs";
import type { RunTriggersOptions } from "../runTriggers";
import type { TriggerRecord, TriggerValue } from "../../interfaces/TriggerDefinition";
import type { TriggerRepository } from "../../interfaces/TriggerRepository";

const DEFAULT_TRIGGER_TIMEOUT_MS = 5_000;

export type TriggerRunOutcome = { ok: true } | { ok: false; error: string };

export async function runOneTrigger(trigger: TriggerRecord, options: RunTriggersOptions): Promise<TriggerRunOutcome> {
    const vars = triggerVars({
        endpoint: options.endpoint,
        request: options.request,
        requestBody: options.requestBody,
        responseStatus: options.responseStatus,
        responseBody: options.responseBody,
        user: options.user,
    });

    try {
        if (trigger.condition && !evaluateCondition(trigger.condition, vars, resolveTriggerReference)) {
            return { ok: true };
        }

        const fn = await options.functions.getFunction(trigger.function.id);
        if (!fn) {
            throw new Error(`function not found: ${trigger.function.id}`);
        }

        const response = await withTimeout(
            executeFunction(fn, functionRequest(trigger, vars, fn.method), functionOptions(options)),
            options.timeoutMs ?? DEFAULT_TRIGGER_TIMEOUT_MS,
        );
        if (!response.ok) {
            throw new Error(await responseError(response));
        }

        await recordRun(options.triggers, trigger.id, { status: "ok" });
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordRun(options.triggers, trigger.id, { status: "error", error: message });
        return { ok: false, error: message };
    }
}

function functionOptions(options: RunTriggersOptions): ExecuteFunctionOptions {
    return {
        sources: options.sources,
        deps: options.deps,
        identities: options.deps?.identities,
        user: options.user,
    };
}

function functionRequest(
    trigger: TriggerRecord,
    vars: Parameters<typeof resolveTriggerReference>[1],
    method: string,
): Request {
    const url = new URL("https://cms.trigger/internal");
    for (const [key, value] of Object.entries(resolveParams(trigger.function.params, vars))) {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    }

    const body = resolveFunctionValue(trigger.function.body, vars, resolveTriggerReference);
    return new Request(url, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

function resolveParams(
    value: Record<string, TriggerValue> | undefined,
    vars: Parameters<typeof resolveTriggerReference>[1],
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value ?? {}).map(([key, item]) => [
            key,
            resolveFunctionValue(item, vars, resolveTriggerReference),
        ]),
    );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error("trigger function timed out")), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

async function recordRun(
    triggers: TriggerRepository,
    id: string,
    result: { status: "ok" | "error"; error?: string },
): Promise<void> {
    try {
        await triggers.recordRun(id, {
            at: new Date().toISOString(),
            status: result.status,
            ...(result.error ? { error: result.error } : {}),
        });
    } catch {
        // Trigger side effects should not make the original endpoint depend on
        // status persistence availability.
    }
}

async function responseError(response: Response): Promise<string> {
    const text = await response.text().catch(() => "");
    const trimmed = text.trim();
    if (!trimmed) {
        return `function returned ${response.status}`;
    }
    return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
}
