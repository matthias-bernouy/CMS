import { collectReferences } from "@bernouy/cms-functions";
import type { TriggerDefinition } from "../interfaces/TriggerDefinition";
import {
    MAX_SCHEDULED_TRIGGER_INTERVAL_MS,
    MAX_SCHEDULED_TRIGGER_TIMEOUT_MS,
    MIN_SCHEDULED_TRIGGER_INTERVAL_MS,
} from "./runtime/scheduled/limits";

export function validateTrigger(trigger: TriggerDefinition): string[] {
    const errors: string[] = [];
    if (!isId(trigger.id)) {
        errors.push("trigger.id must be a simple id");
    }
    if (trigger.label !== undefined && typeof trigger.label !== "string") {
        errors.push("trigger.label must be a string");
    }
    if (trigger.critical !== undefined && typeof trigger.critical !== "boolean") {
        errors.push("trigger.critical must be a boolean");
    }
    validateEvent(trigger, errors);
    if (trigger.mode !== undefined && trigger.mode !== "sync" && trigger.mode !== "async") {
        errors.push("trigger.mode must be sync or async");
    }
    if (trigger.failureMode !== undefined && trigger.failureMode !== "block" && trigger.failureMode !== "ignore") {
        errors.push("trigger.failureMode must be block or ignore");
    }
    if (!!trigger.function === !!trigger.task) {
        errors.push("trigger must declare exactly one function or task target");
    } else if (trigger.function && !isId(trigger.function.id)) {
        errors.push("trigger.function.id must be a simple id");
    } else if (trigger.task && !isTaskId(trigger.task.id)) {
        errors.push("trigger.task.id must be a qualified id");
    }
    if (trigger.event?.kind === "endpoint" && trigger.task) {
        errors.push("endpoint triggers must target a function");
    }
    if (trigger.event?.kind === "schedule") {
        if (trigger.mode !== undefined && trigger.mode !== "async") {
            errors.push("scheduled triggers are asynchronous");
        }
        if (trigger.failureMode !== undefined && trigger.failureMode !== "ignore") {
            errors.push("scheduled trigger failures cannot block a request");
        }
        if (trigger.condition !== undefined) {
            errors.push("scheduled triggers do not support conditions");
        }
    }

    for (const ref of collectTriggerReferences(trigger)) {
        if (!isKnownTriggerRef(ref, trigger.event?.kind)) {
            errors.push(`trigger has an invalid reference "${ref}"`);
        }
    }

    return errors;
}

function collectTriggerReferences(trigger: TriggerDefinition): string[] {
    return [
        ...collectReferences(trigger.condition),
        ...collectReferences(trigger.function?.params),
        ...collectReferences(trigger.function?.body),
        ...collectReferences(trigger.task?.body),
    ];
}

function isKnownTriggerRef(ref: string, kind: TriggerDefinition["event"]["kind"] | undefined): boolean {
    if (kind === "schedule") {
        return ["$schedule.runId", "$schedule.runKey", "$schedule.scheduledAt", "$trigger.id"].includes(ref);
    }
    return (
        ref === "$request" ||
        ref === "$request.method" ||
        ref === "$request.params" ||
        ref.startsWith("$request.params.") ||
        ref === "$request.body" ||
        ref.startsWith("$request.body.") ||
        ref === "$response" ||
        ref === "$response.status" ||
        ref === "$response.body" ||
        ref.startsWith("$response.body.") ||
        ref === "$endpoint" ||
        ref === "$endpoint.urn" ||
        ref === "$endpoint.source" ||
        ref === "$endpoint.endpoint" ||
        ref === "$ctx" ||
        ref === "$ctx.user" ||
        ref.startsWith("$ctx.user.")
    );
}

function validateEvent(trigger: TriggerDefinition, errors: string[]): void {
    if (!trigger.event || (trigger.event.kind !== "endpoint" && trigger.event.kind !== "schedule")) {
        errors.push("trigger.event.kind must be endpoint or schedule");
        return;
    }
    if (trigger.event.kind === "endpoint") {
        if (trigger.event.source !== undefined && !isId(trigger.event.source)) {
            errors.push("trigger.event.source must be a simple id");
        }
        if (trigger.event.endpoint !== undefined && !isId(trigger.event.endpoint)) {
            errors.push("trigger.event.endpoint must be a simple id");
        }
        if (trigger.event.phase !== "request" && trigger.event.phase !== "response") {
            errors.push("trigger.event.phase must be request or response");
        }
        return;
    }
    if (
        !integerBetween(trigger.event.intervalMs, MIN_SCHEDULED_TRIGGER_INTERVAL_MS, MAX_SCHEDULED_TRIGGER_INTERVAL_MS)
    ) {
        errors.push("trigger.event.intervalMs must be an integer between 5000 and 86400000");
    }
    if (
        trigger.event.initialDelayMs !== undefined &&
        !integerBetween(trigger.event.initialDelayMs, 0, trigger.event.intervalMs)
    ) {
        errors.push("trigger.event.initialDelayMs must be between 0 and intervalMs");
    }
    if (
        trigger.event.timeoutMs !== undefined &&
        !integerBetween(trigger.event.timeoutMs, 1_000, MAX_SCHEDULED_TRIGGER_TIMEOUT_MS)
    ) {
        errors.push("trigger.event.timeoutMs must be an integer between 1000 and 900000");
    }
}

function integerBetween(value: unknown, min: number, max: number): value is number {
    return Number.isSafeInteger(value) && typeof value === "number" && value >= min && value <= max;
}

function isId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function isTaskId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value);
}
