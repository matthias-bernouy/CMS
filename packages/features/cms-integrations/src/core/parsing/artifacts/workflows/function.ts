import type { FunctionDto } from "@bernouy/cms-functions";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../../values";
import { parseAccessTemplate } from "../common";

export function parseFunctionTemplate(value: Record<string, unknown>, name: string): FunctionDto {
    const id = text(value.id);
    if (!id) throw new MissingIntegrationParam(`${name}.id`);
    const method = text(value.method);
    if (!method) throw new MissingIntegrationParam(`${name}.method`);
    if (!Array.isArray(value.steps)) throw new IntegrationInputError(`${name}.steps`, "must be an array");
    if (!isRecord(value.return)) throw new IntegrationInputError(`${name}.return`, "must be an object");
    return {
        id,
        method: method as FunctionDto["method"],
        ...(value.access !== undefined ? { access: parseAccessTemplate(value.access, `${name}.access`) } : {}),
        ...(isRecord(value.meta) ? { meta: value.meta as FunctionDto["meta"] } : {}),
        ...(isRecord(value.input) ? { input: value.input as FunctionDto["input"] } : {}),
        ...(Array.isArray(value.output) ? { output: value.output as FunctionDto["output"] } : {}),
        ...(isRecord(value.ui) ? { ui: value.ui as FunctionDto["ui"] } : {}),
        steps: value.steps as FunctionDto["steps"],
        return: value.return as FunctionDto["return"],
    };
}
