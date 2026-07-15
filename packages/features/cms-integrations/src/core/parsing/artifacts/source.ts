import type {
    ComputedParamRef,
    EndpointHeader,
    HeaderSource,
    SourceDto,
    SourceEndpointDto,
    SourceParamDto,
} from "@bernouy/cms-sources";
import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import { parseArtifactIcon } from "../icon";
import { isJsonValue, isRecord, text } from "../values";
import { parseAccessTemplate, requiredText } from "./common";

export function parseSourceTemplate(value: Record<string, unknown>, name: string): SourceDto {
    const id = text(value.id);
    if (!id) throw new MissingIntegrationParam(`${name}.id`);
    if (!isRecord(value.meta)) throw new IntegrationInputError(`${name}.meta`, "must be an object");
    const metaName = text(value.meta.name);
    if (!metaName) throw new MissingIntegrationParam(`${name}.meta.name`);
    const metaIcon = parseArtifactIcon(value.meta.icon, `${name}.meta.icon`);
    if (!Array.isArray(value.endpoints)) throw new IntegrationInputError(`${name}.endpoints`, "must be an array");
    return {
        id,
        meta: {
            name: metaName,
            ...(text(value.meta.description) ? { description: text(value.meta.description)! } : {}),
            ...(metaIcon ? { icon: metaIcon } : {}),
            ...(text(value.meta.svg) ? { svg: text(value.meta.svg)! } : {}),
        },
        endpoints: value.endpoints.map((endpoint, index) => parseEndpointTemplate(endpoint, `${name}.endpoints.${index}`)),
    };
}

function parseEndpointTemplate(value: unknown, name: string): SourceEndpointDto {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const endpointId = text(value.endpointId);
    if (!endpointId) throw new MissingIntegrationParam(`${name}.endpointId`);
    const method = text(value.method);
    if (!method) throw new MissingIntegrationParam(`${name}.method`);
    const targetUrl = text(value.targetUrl);
    if (!targetUrl) throw new MissingIntegrationParam(`${name}.targetUrl`);
    if (!Array.isArray(value.params)) throw new IntegrationInputError(`${name}.params`, "must be an array");
    const responseKind = parseResponseKind(value.responseKind, `${name}.responseKind`);
    return {
        endpointId,
        method: method as SourceEndpointDto["method"],
        targetUrl,
        ...(value.access !== undefined ? { access: parseAccessTemplate(value.access, `${name}.access`) } : {}),
        ...(responseKind ? { responseKind } : {}),
        ...(text(value.mediaType) ? { mediaType: text(value.mediaType)! } : {}),
        params: value.params.map((param, index) => parseParamTemplate(param, `${name}.params.${index}`)),
        ...(isJsonValue(value.body) ? { body: value.body as SourceEndpointDto["body"] } : {}),
        ...(Array.isArray(value.output) ? { output: value.output as SourceEndpointDto["output"] } : {}),
        ...(isRecord(value.meta) ? { meta: value.meta as SourceEndpointDto["meta"] } : {}),
        ...(value.headers !== undefined ? { headers: parseHeaderTemplates(value.headers, `${name}.headers`) } : {}),
    };
}

function parseResponseKind(value: unknown, name: string): SourceEndpointDto["responseKind"] | undefined {
    if (value === undefined) return undefined;
    if (value === "json" || value === "file") return value;
    throw new IntegrationInputError(name, "must be json or file");
}

function parseHeaderTemplates(value: unknown, name: string): EndpointHeader[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseHeaderTemplate(entry, `${name}.${index}`));
}

function parseHeaderTemplate(value: unknown, name: string): EndpointHeader {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const headerName = text(value.name);
    if (!headerName) throw new MissingIntegrationParam(`${name}.name`);
    if (!isRecord(value.source)) throw new IntegrationInputError(`${name}.source`, "must be an object");
    return { name: headerName, source: parseHeaderSource(value.source, `${name}.source`) };
}

function parseHeaderSource(value: Record<string, unknown>, name: string): HeaderSource {
    const from = text(value.from);
    if (from === "static") {
        if (typeof value.value !== "string") throw new MissingIntegrationParam(`${name}.value`);
        return { from, value: value.value };
    }
    if (from === "secret") {
        const ref = text(value.ref);
        if (!ref) throw new MissingIntegrationParam(`${name}.ref`);
        return { from, ref, ...(typeof value.prefix === "string" ? { prefix: value.prefix } : {}) };
    }
    if (from === "computed") {
        const ref = text(value.ref);
        if (!ref) throw new MissingIntegrationParam(`${name}.ref`);
        return { from, ref: ref as ComputedParamRef };
    }
    throw new IntegrationInputError(`${name}.from`, "must be static, secret, or computed");
}

function parseParamTemplate(value: unknown, name: string): SourceParamDto {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const paramName = text(value.name);
    if (!paramName) throw new MissingIntegrationParam(`${name}.name`);
    const location = text(value.in);
    if (!location) throw new MissingIntegrationParam(`${name}.in`);
    return {
        name: paramName,
        in: location as SourceParamDto["in"],
        ...(text(value.type) ? { type: text(value.type)! as SourceParamDto["type"] } : {}),
        ...(value.required === true ? { required: true } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(isRecord(value.source) ? { source: value.source as SourceParamDto["source"] } : {}),
    };
}

export { requiredText };
