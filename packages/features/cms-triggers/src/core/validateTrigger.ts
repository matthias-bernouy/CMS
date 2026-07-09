import { collectReferences } from "@bernouy/cms-functions";
import type { TriggerDefinition } from "../interfaces/TriggerDefinition";

export function validateTrigger(trigger: TriggerDefinition): string[] {
    const errors: string[] = [];
    if (!isId(trigger.id)) errors.push("trigger.id must be a simple id");
    if (trigger.label !== undefined && typeof trigger.label !== "string") errors.push("trigger.label must be a string");
    if (!trigger.event || trigger.event.kind !== "endpoint") errors.push("trigger.event.kind must be endpoint");
    if (trigger.event?.source !== undefined && !isId(trigger.event.source)) errors.push("trigger.event.source must be a simple id");
    if (trigger.event?.endpoint !== undefined && !isId(trigger.event.endpoint)) errors.push("trigger.event.endpoint must be a simple id");
    if (trigger.event?.phase !== "request" && trigger.event?.phase !== "response") errors.push("trigger.event.phase must be request or response");
    if (trigger.mode !== undefined && trigger.mode !== "sync" && trigger.mode !== "async") errors.push("trigger.mode must be sync or async");
    if (trigger.failureMode !== undefined && trigger.failureMode !== "block" && trigger.failureMode !== "ignore") {
        errors.push("trigger.failureMode must be block or ignore");
    }
    if (!isId(trigger.function?.id)) errors.push("trigger.function.id must be a simple id");

    for (const ref of collectTriggerReferences(trigger)) {
        if (!isKnownTriggerRef(ref)) errors.push(`trigger has an invalid reference "${ref}"`);
    }

    return errors;
}

function collectTriggerReferences(trigger: TriggerDefinition): string[] {
    return [
        ...collectReferences(trigger.condition),
        ...collectReferences(trigger.function?.params),
        ...collectReferences(trigger.function?.body),
    ];
}

function isKnownTriggerRef(ref: string): boolean {
    return ref === "$request"
        || ref === "$request.method"
        || ref === "$request.params"
        || ref.startsWith("$request.params.")
        || ref === "$request.body"
        || ref.startsWith("$request.body.")
        || ref === "$response"
        || ref === "$response.status"
        || ref === "$response.body"
        || ref.startsWith("$response.body.")
        || ref === "$endpoint"
        || ref === "$endpoint.urn"
        || ref === "$endpoint.source"
        || ref === "$endpoint.endpoint"
        || ref === "$ctx"
        || ref === "$ctx.user"
        || ref.startsWith("$ctx.user.");
}

function isId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}
