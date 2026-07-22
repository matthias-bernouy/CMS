import type { TriggerDto } from "@bernouy/cms-triggers";
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
    if (!isRecord(value.function)) {
        throw new IntegrationInputError(`${name}.function`, "must be an object");
    }
    const eventKind = text(value.event.kind);
    if (eventKind !== "endpoint") {
        throw new IntegrationInputError(`${name}.event.kind`, "must be endpoint");
    }
    const phase = text(value.event.phase);
    if (phase !== "request" && phase !== "response") {
        throw new IntegrationInputError(`${name}.event.phase`, "must be request or response");
    }
    const functionId = text(value.function.id);
    if (!functionId) {
        throw new MissingIntegrationParam(`${name}.function.id`);
    }
    return {
        id,
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        event: {
            kind: "endpoint",
            ...(text(value.event.source) ? { source: text(value.event.source)! } : {}),
            ...(text(value.event.endpoint) ? { endpoint: text(value.event.endpoint)! } : {}),
            phase,
        },
        ...(value.mode !== undefined ? { mode: text(value.mode) as TriggerDto["mode"] } : {}),
        ...(value.failureMode !== undefined
            ? { failureMode: text(value.failureMode) as TriggerDto["failureMode"] }
            : {}),
        ...(value.condition !== undefined ? { condition: value.condition as TriggerDto["condition"] } : {}),
        function: {
            id: functionId,
            ...(isRecord(value.function.params)
                ? { params: value.function.params as NonNullable<TriggerDto["function"]["params"]> }
                : {}),
            ...(value.function.body !== undefined
                ? { body: value.function.body as TriggerDto["function"]["body"] }
                : {}),
        },
    };
}
