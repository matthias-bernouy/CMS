import { MAX_SOURCE_ENDPOINT_TIMEOUT_MS, type SourceEndpointDto } from "@bernouy/cms-sources";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isJsonValue, isRecord, text } from "../../definition/values";
import { parseAccessTemplate } from "../common";
import { parseEndpointEffects } from "./endpointEffects";
import { parseHeaderTemplates, parseParamTemplate } from "./inputs";

export function parseEndpointTemplate(value: unknown, name: string): SourceEndpointDto {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const endpointId = text(value.endpointId);
    if (!endpointId) {
        throw new MissingIntegrationParam(`${name}.endpointId`);
    }
    const method = text(value.method);
    if (!method) {
        throw new MissingIntegrationParam(`${name}.method`);
    }
    const targetUrl = text(value.targetUrl);
    if (!targetUrl) {
        throw new MissingIntegrationParam(`${name}.targetUrl`);
    }
    if (!Array.isArray(value.params)) {
        throw new IntegrationInputError(`${name}.params`, "must be an array");
    }
    const responseKind = parseResponseKind(value.responseKind, `${name}.responseKind`);
    const timeoutMs = parseTimeoutMs(value.timeoutMs, `${name}.timeoutMs`);
    return {
        endpointId,
        ...(text(value.contractVersion) ? { contractVersion: text(value.contractVersion)! } : {}),
        method: method as SourceEndpointDto["method"],
        targetUrl,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(value.access !== undefined ? { access: parseAccessTemplate(value.access, `${name}.access`) } : {}),
        ...(value.effects !== undefined ? { effects: parseEndpointEffects(value.effects, `${name}.effects`) } : {}),
        ...(responseKind ? { responseKind } : {}),
        ...(text(value.mediaType) ? { mediaType: text(value.mediaType)! } : {}),
        params: value.params.map((param, index) => parseParamTemplate(param, `${name}.params.${index}`)),
        ...(isJsonValue(value.body) ? { body: value.body as SourceEndpointDto["body"] } : {}),
        ...(Array.isArray(value.output) ? { output: value.output as SourceEndpointDto["output"] } : {}),
        ...(isRecord(value.meta) ? { meta: value.meta as SourceEndpointDto["meta"] } : {}),
        ...(value.headers !== undefined ? { headers: parseHeaderTemplates(value.headers, `${name}.headers`) } : {}),
    };
}

function parseTimeoutMs(value: unknown, name: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_SOURCE_ENDPOINT_TIMEOUT_MS) {
        throw new IntegrationInputError(name, `must be an integer between 1 and ${MAX_SOURCE_ENDPOINT_TIMEOUT_MS}`);
    }
    return value as number;
}

function parseResponseKind(value: unknown, name: string): SourceEndpointDto["responseKind"] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === "json" || value === "file") {
        return value;
    }
    throw new IntegrationInputError(name, "must be json or file");
}
