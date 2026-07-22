import { DuplicateFunctionError, validateFunction, type CmsFunction } from "@bernouy/cms-functions";
import type { ControlCms } from "cms-control/ControlCms";
import HttpError from "cms-control/core/admin/http/errors/HttpError";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { toFunctionDetailItem, type FunctionDetailItem } from "./functionViews";

export async function createFunctionDefinition(cms: ControlCms, value: unknown): Promise<FunctionDetailItem> {
    const repository = cms.functions;
    if (!repository) {
        throw new HttpError(501, "functions not configured");
    }
    const definition = parseDefinition(value);
    const errors = await validateDefinition(definition, cms);
    if (errors.length) {
        throw new InvalidParam("definition", errors.join("; "));
    }

    try {
        return toFunctionDetailItem(await repository.createFunction(definition));
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
