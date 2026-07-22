import type { ComputedParamRef, EndpointHeader, HeaderSource, SourceParamDto } from "@bernouy/cms-sources";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../../definition/values";

export function parseHeaderTemplates(value: unknown, name: string): EndpointHeader[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => parseHeaderTemplate(entry, `${name}.${index}`));
}

export function parseParamTemplate(value: unknown, name: string): SourceParamDto {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const paramName = text(value.name);
    if (!paramName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    const location = text(value.in);
    if (!location) {
        throw new MissingIntegrationParam(`${name}.in`);
    }
    const semantic = parseParamSemantic(value.semantic, `${name}.semantic`);
    return {
        name: paramName,
        in: location as SourceParamDto["in"],
        ...(text(value.type) ? { type: text(value.type)! as SourceParamDto["type"] } : {}),
        ...(semantic ? { semantic } : {}),
        ...(value.required === true ? { required: true } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(isRecord(value.source) ? { source: value.source as SourceParamDto["source"] } : {}),
    };
}

function parseHeaderTemplate(value: unknown, name: string): EndpointHeader {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const headerName = text(value.name);
    if (!headerName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    if (!isRecord(value.source)) {
        throw new IntegrationInputError(`${name}.source`, "must be an object");
    }
    return { name: headerName, source: parseHeaderSource(value.source, `${name}.source`) };
}

function parseHeaderSource(value: Record<string, unknown>, name: string): HeaderSource {
    const from = text(value.from);
    if (from === "static") {
        if (typeof value.value !== "string") {
            throw new MissingIntegrationParam(`${name}.value`);
        }
        return { from, value: value.value };
    }
    if (from === "secret") {
        const ref = text(value.ref);
        if (!ref) {
            throw new MissingIntegrationParam(`${name}.ref`);
        }
        return { from, ref, ...(typeof value.prefix === "string" ? { prefix: value.prefix } : {}) };
    }
    if (from === "computed") {
        const ref = text(value.ref);
        if (!ref) {
            throw new MissingIntegrationParam(`${name}.ref`);
        }
        return { from, ref: ref as ComputedParamRef };
    }
    throw new IntegrationInputError(`${name}.from`, "must be static, secret, or computed");
}

function parseParamSemantic(value: unknown, name: string): SourceParamDto["semantic"] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === "user-id") {
        return { kind: "user-id" };
    }
    if (!isRecord(value) || value.kind !== "user-id") {
        throw new IntegrationInputError(name, "must be user-id or a user-id semantic object");
    }
    const authority = value.authority === undefined ? undefined : text(value.authority);
    if (value.authority !== undefined && !authority) {
        throw new IntegrationInputError(`${name}.authority`, "must be a non-empty string");
    }
    return { kind: "user-id", ...(authority ? { authority } : {}) };
}
