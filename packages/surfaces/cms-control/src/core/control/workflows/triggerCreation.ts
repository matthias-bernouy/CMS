import { collectReferences } from "@bernouy/cms-functions";
import { makeEndpointUrn } from "@bernouy/cms-sources";
import {
    DuplicateTriggerError,
    validateTrigger,
    type TriggerDefinition,
    type TriggerRecord,
} from "@bernouy/cms-triggers";
import type { ControlCms } from "cms-control/ControlCms";
import HttpError from "cms-control/errors/Http/HttpError";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

export async function createTriggerDefinition(
    cms: ControlCms,
    value: unknown,
    enabledValue: unknown,
): Promise<TriggerRecord> {
    const repository = cms.triggers;
    if (!repository) {
        throw new HttpError(501, "triggers not configured");
    }
    if (!cms.functions) {
        throw new HttpError(501, "functions not configured");
    }
    const definition = parseDefinition(value);
    const enabled = enabledValue === undefined ? false : enabledValue;
    if (typeof enabled !== "boolean") {
        throw new InvalidParam("enabled", "must be boolean.");
    }
    const errors = await validateDefinition(definition, cms);
    if (errors.length) {
        throw new InvalidParam("definition", errors.join("; "));
    }

    try {
        return await repository.createTrigger({ ...definition, enabled });
    } catch (error) {
        if (error instanceof DuplicateTriggerError) {
            throw new HttpError(409, `Trigger "${definition.id}" already exists.`);
        }
        throw error;
    }
}

function parseDefinition(value: unknown): TriggerDefinition {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new InvalidParam("definition", "must be an object.");
    }
    const definition = structuredClone(value) as TriggerDefinition;
    if (
        !definition.event ||
        typeof definition.event !== "object" ||
        !definition.function ||
        typeof definition.function !== "object"
    ) {
        throw new InvalidParam("definition", "event and function are required.");
    }
    return definition;
}

async function validateDefinition(definition: TriggerDefinition, cms: ControlCms): Promise<string[]> {
    const errors = validateTrigger(definition);
    if (!(await cms.functions!.getFunction(definition.function.id))) {
        errors.push(`trigger function "${definition.function.id}" does not exist`);
    }
    if (
        definition.event.phase === "request" &&
        references(definition).some((ref) => ref === "$response" || ref.startsWith("$response."))
    ) {
        errors.push("request-phase triggers cannot reference $response");
    }
    if (definition.mode === "async" && definition.failureMode === "block") {
        errors.push("async triggers cannot block the source response");
    }
    if (definition.event.source && definition.event.endpoint) {
        const endpoint = await cms.sources.getEndpoint(
            makeEndpointUrn(definition.event.source, definition.event.endpoint),
        );
        if (!endpoint) {
            errors.push(`trigger endpoint "${definition.event.source}.${definition.event.endpoint}" does not exist`);
        }
    }
    return errors;
}

function references(definition: TriggerDefinition): string[] {
    return [
        ...collectReferences(definition.condition),
        ...collectReferences(definition.function.params),
        ...collectReferences(definition.function.body),
    ];
}
