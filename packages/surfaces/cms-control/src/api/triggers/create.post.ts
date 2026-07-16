import { collectReferences } from "@bernouy/cms-functions";
import {
    DuplicateTriggerError,
    validateTrigger,
    type TriggerDefinition,
    type TriggerRecord,
} from "@bernouy/cms-triggers";
import { makeEndpointUrn } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import HttpError from "cms-control/errors/Http/HttpError";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

export default async function createTrigger(req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.triggers;
    if (!repository) return new Response("triggers not configured", { status: 501 });
    if (!cms.functions) return new Response("functions not configured", { status: 501 });

    const payload = await readJsonBody(req);
    const definition = parseDefinition(payload.definition);
    const enabled = payload.enabled === undefined ? false : payload.enabled;
    if (typeof enabled !== "boolean") throw new InvalidParam("enabled", "must be boolean.");

    const errors = await validateDefinition(definition, cms);
    if (errors.length) throw new InvalidParam("definition", errors.join("; "));

    const record: TriggerRecord = { ...definition, enabled };
    try {
        return Response.json(await repository.createTrigger(record), { status: 201 });
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
    if (!definition.event || typeof definition.event !== "object" || !definition.function || typeof definition.function !== "object") {
        throw new InvalidParam("definition", "event and function are required.");
    }
    return definition;
}

async function validateDefinition(definition: TriggerDefinition, cms: ControlCms): Promise<string[]> {
    const errors = validateTrigger(definition);
    const fn = await cms.functions!.getFunction(definition.function.id);
    if (!fn) errors.push(`trigger function "${definition.function.id}" does not exist`);

    if (definition.event.phase === "request" && references(definition).some(ref => ref === "$response" || ref.startsWith("$response."))) {
        errors.push("request-phase triggers cannot reference $response");
    }
    if (definition.mode === "async" && definition.failureMode === "block") {
        errors.push("async triggers cannot block the source response");
    }
    if (definition.event.source && definition.event.endpoint) {
        const endpoint = await cms.sources.getEndpoint(makeEndpointUrn(definition.event.source, definition.event.endpoint));
        if (!endpoint) errors.push(`trigger endpoint "${definition.event.source}.${definition.event.endpoint}" does not exist`);
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
