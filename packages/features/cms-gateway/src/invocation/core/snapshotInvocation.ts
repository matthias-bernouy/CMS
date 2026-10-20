import {
    canonicalIJsonBytes,
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";
import type { GatewayActor, GatewayInvocation } from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

/** Bounded JSON envelope budget, including escaping and metadata around a 1 MiB contract string. */
export const MAX_GATEWAY_JSON_BYTES = MAX_CAPABILITY_JSON_BYTES;
const INVOCATION_FIELDS = new Set([
    "siteId",
    "contractId",
    "capabilityId",
    "input",
    "binaryBody",
    "httpMethod",
    "actor",
    "idempotencyKey",
]);

/** Snapshot caller input before the first asynchronous route or grant lookup. */
export function snapshotInvocation(value: GatewayInvocation): GatewayInvocation {
    if (!value || typeof value !== "object") {
        throw new GatewayError("invalid_input", "invocation context is required");
    }
    if (Object.keys(value).some((field) => !INVOCATION_FIELDS.has(field))) {
        throw new GatewayError("invalid_input", "invocation context contains an unsupported field");
    }
    if (
        typeof value.siteId !== "string" ||
        !value.siteId.trim() ||
        value.siteId !== value.siteId.trim() ||
        value.siteId.length > 128
    ) {
        throw new GatewayError("invalid_input", "site identifier is invalid");
    }
    for (const field of [value.contractId, value.capabilityId]) {
        if (typeof field !== "string" || field.length > 128 || !/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/.test(field)) {
            throw new GatewayError("invalid_input", "contract or capability identifier is invalid");
        }
    }
    if (value.httpMethod !== undefined && value.httpMethod !== "HEAD") {
        throw new GatewayError("invalid_input", "HTTP method override is invalid");
    }
    const actor = snapshotActor(value.actor);
    const idempotencyKey = snapshotIdempotencyKey(value.idempotencyKey);
    try {
        const bytes = canonicalIJsonBytes(value.input, MAX_CAPABILITY_JSON_DEPTH);
        if (bytes.byteLength > MAX_GATEWAY_JSON_BYTES) {
            throw new TypeError("input exceeds gateway limit");
        }
        const binaryBody = snapshotBinaryBody(value.binaryBody);
        return {
            siteId: value.siteId,
            contractId: value.contractId,
            capabilityId: value.capabilityId,
            actor,
            ...(value.httpMethod ? { httpMethod: value.httpMethod } : {}),
            ...(idempotencyKey ? { idempotencyKey } : {}),
            ...(binaryBody ? { binaryBody } : {}),
            input: parseStrictJson(bytes, MAX_GATEWAY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH),
        };
    } catch {
        throw new GatewayError("invalid_input", "input must be bounded interoperable JSON");
    }
}

function snapshotBinaryBody(value: GatewayInvocation["binaryBody"]): GatewayInvocation["binaryBody"] {
    if (value === undefined) {
        return undefined;
    }
    if (!value || typeof value !== "object" || !(value.stream instanceof ReadableStream)) {
        throw new GatewayError("invalid_input", "binary body must be a readable byte stream");
    }
    if (value.contentLength !== undefined && (!Number.isSafeInteger(value.contentLength) || value.contentLength < 0)) {
        throw new GatewayError("invalid_input", "binary content length is invalid");
    }
    if (
        value.contentType !== undefined &&
        (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+(?:\s*;[^\r\n]*)?$/.test(value.contentType) ||
            value.contentType.length > 256)
    ) {
        throw new GatewayError("invalid_input", "binary content type is invalid");
    }
    return {
        stream: value.stream,
        ...(value.contentType ? { contentType: value.contentType } : {}),
        ...(value.contentLength === undefined ? {} : { contentLength: value.contentLength }),
    };
}

function snapshotIdempotencyKey(value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
        throw new GatewayError("invalid_input", "idempotency key is invalid");
    }
    return value;
}

function snapshotActor(actor: GatewayActor): GatewayActor {
    if (!actor || typeof actor !== "object") {
        throw new GatewayError("not_authorized", "trusted actor context is required");
    }
    switch (actor.kind) {
        case "anonymous":
            requireActorFields(actor, ["kind"]);
            return { kind: "anonymous" };
        case "user":
        case "administrator":
            requireActorFields(actor, ["kind", "subjectId"]);
            requireId(actor.subjectId);
            return { kind: actor.kind, subjectId: actor.subjectId };
        case "provider":
            requireActorFields(actor, ["kind", "installationId"]);
            requireId(actor.installationId);
            return { kind: "provider", installationId: actor.installationId };
        case "system":
            requireActorFields(actor, ["kind", "serviceId"]);
            requireId(actor.serviceId);
            return { kind: "system", serviceId: actor.serviceId };
        default:
            throw new GatewayError("not_authorized", "actor kind is invalid");
    }
}

function requireActorFields(actor: GatewayActor, allowed: readonly string[]): void {
    if (Object.keys(actor).some((field) => !allowed.includes(field))) {
        throw new GatewayError("not_authorized", "actor context contains an unsupported field");
    }
}

function requireId(value: unknown): void {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 256) {
        throw new GatewayError("not_authorized", "actor identity is invalid");
    }
}
