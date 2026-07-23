import type { TriggerDto, TriggerEvent, TriggerFunctionCall, TriggerTaskCall } from "@bernouy/cms-triggers";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../../definition/values";

export function parseTriggerTemplate(value: Record<string, unknown>, name: string): TriggerDto {
    const id = text(value.id);
    if (!id) {
        throw new MissingIntegrationParam(`${name}.id`);
    }
    if (!isRecord(value.event)) {
        throw new IntegrationInputError(`${name}.event`, "must be an object");
    }
    const event = parseEvent(value.event, name);
    const target = parseTarget(value, name);
    return {
        id,
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        ...(typeof value.critical === "boolean" ? { critical: value.critical } : {}),
        event,
        ...(value.mode !== undefined ? { mode: text(value.mode) as TriggerDto["mode"] } : {}),
        ...(value.failureMode !== undefined
            ? { failureMode: text(value.failureMode) as TriggerDto["failureMode"] }
            : {}),
        ...(value.condition !== undefined ? { condition: value.condition as TriggerDto["condition"] } : {}),
        ...target,
    };
}

function parseEvent(value: Record<string, unknown>, name: string): TriggerEvent {
    const kind = text(value.kind);
    if (kind === "endpoint") {
        const phase = text(value.phase);
        if (phase !== "request" && phase !== "response") {
            throw new IntegrationInputError(`${name}.event.phase`, "must be request or response");
        }
        return {
            kind,
            ...(text(value.source) ? { source: text(value.source)! } : {}),
            ...(text(value.endpoint) ? { endpoint: text(value.endpoint)! } : {}),
            phase,
        };
    }
    if (kind === "schedule") {
        return {
            kind,
            intervalMs: number(value.intervalMs, `${name}.event.intervalMs`),
            ...(value.initialDelayMs !== undefined
                ? { initialDelayMs: number(value.initialDelayMs, `${name}.event.initialDelayMs`) }
                : {}),
            ...(value.timeoutMs !== undefined ? { timeoutMs: number(value.timeoutMs, `${name}.event.timeoutMs`) } : {}),
        };
    }
    throw new IntegrationInputError(`${name}.event.kind`, "must be endpoint or schedule");
}

function parseTarget(
    value: Record<string, unknown>,
    name: string,
): { function: TriggerFunctionCall } | { task: TriggerTaskCall } {
    const functionValue = isRecord(value.function) ? value.function : null;
    const taskValue = isRecord(value.task) ? value.task : null;
    if (!!functionValue === !!taskValue) {
        throw new IntegrationInputError(name, "must declare exactly one function or task");
    }
    if (functionValue) {
        const id = requiredId(functionValue.id, `${name}.function.id`);
        return {
            function: {
                id,
                ...(isRecord(functionValue.params)
                    ? { params: functionValue.params as TriggerFunctionCall["params"] }
                    : {}),
                ...(functionValue.body !== undefined
                    ? { body: functionValue.body as TriggerFunctionCall["body"] }
                    : {}),
            },
        };
    }
    return {
        task: {
            id: requiredId(taskValue!.id, `${name}.task.id`),
            ...(taskValue!.body !== undefined ? { body: taskValue!.body as TriggerTaskCall["body"] } : {}),
        },
    };
}

function requiredId(value: unknown, name: string): string {
    const id = text(value);
    if (!id) {
        throw new MissingIntegrationParam(name);
    }
    return id;
}

function number(value: unknown, name: string): number {
    if (typeof value !== "number") {
        throw new IntegrationInputError(name, "must be a number");
    }
    return value;
}
