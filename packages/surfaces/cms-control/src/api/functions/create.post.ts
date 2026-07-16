import {
    DuplicateFunctionError,
    validateFunction,
    type CmsFunction,
} from "@bernouy/cms-functions";
import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import HttpError from "cms-control/errors/Http/HttpError";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { toFunctionDetailItem } from "../functions.get";

export default async function createFunction(req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.functions;
    if (!repository) return new Response("functions not configured", { status: 501 });

    const payload = await readJsonBody(req);
    const definition = parseDefinition(payload.definition);
    const errors = await validateDefinition(definition, cms);
    if (errors.length) throw new InvalidParam("definition", errors.join("; "));

    try {
        const created = await repository.createFunction(definition);
        return Response.json(toFunctionDetailItem(created), { status: 201 });
    } catch (error) {
        if (error instanceof DuplicateFunctionError) {
            throw new HttpError(409, `Function "${definition.id}" already exists.`);
        }
        throw error;
    }
}

function parseDefinition(value: unknown): CmsFunction {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new InvalidParam("definition", "must be an object.");
    }
    return structuredClone(value) as CmsFunction;
}

async function validateDefinition(definition: CmsFunction, cms: ControlCms): Promise<string[]> {
    try {
        return await validateFunction(definition, { sources: cms.sources });
    } catch (error) {
        return [error instanceof Error ? error.message : "function definition is invalid"];
    }
}
