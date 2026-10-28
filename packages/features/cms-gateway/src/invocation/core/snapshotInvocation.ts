import { isTraceContext } from "@bernouy/logging";
import {
    canonicalIJsonBytes,
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";
import type { GatewayActor, GatewayInvocation } from "cms-gateway/invocation/interfaces/Invocation";
import { validDelegationTicket } from "cms-gateway/access/delegation/wire";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

/** Bounded JSON envelope budget, including escaping and metadata around a 1 MiB contract string. */
export const MAX_GATEWAY_JSON_BYTES = MAX_CAPABILITY_JSON_BYTES;
const INVOCATION_FIELDS = new Set([
    "siteId",
    "trace",
    "contractId",
    "capabilityId",
    "input",
    "binaryBody",
    "bindingId",
    "bindingTransport",
    "metadataOnly",
    "actor",
    "idempotencyKey",
    "actorCredential",
    "delegationTicket",
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
    if (
        (value.bindingTransport !== undefined &&
            (typeof value.bindingTransport !== "string" || !/^[a-z]{1,32}$/u.test(value.bindingTransport))) ||
        (value.bindingId !== undefined &&
            (typeof value.bindingId !== "string" || !/^[a-z][a-z0-9.-]{0,63}$/u.test(value.bindingId))) ||
        (value.metadataOnly !== undefined && typeof value.metadataOnly !== "boolean")
    ) {
        throw new GatewayError("invalid_input", "binding or representation selection is invalid");
    }
    if (value.trace !== undefined && !isTraceContext(value.trace)) {
        throw new GatewayError("invalid_input", "Invalid trace context");
    }
    const actor = snapshotActor(value.actor);
    if (
        value.delegationTicket !== undefined &&
        (actor.kind !== "provider" || !validDelegationTicket(value.delegationTicket))
    ) {
        throw new GatewayError("not_authorized", "delegation requires an authenticated source Provider");
    }
    const idempotencyKey = snapshotIdempotencyKey(value.idempotencyKey);
    const actorCredential = snapshotActorCredential(value.actorCredential);
    try {
        const bytes = canonicalIJsonBytes(value.input, MAX_CAPABILITY_JSON_DEPTH);
        if (bytes.byteLength > MAX_GATEWAY_JSON_BYTES) {
            throw new TypeError("input exceeds gateway limit");
        }
        const binaryBody = snapshotBinaryBody(value.binaryBody);
        return {
            siteId: value.siteId,
            ...(value.trace ? { trace: { ...value.trace } } : {}),
            contractId: value.contractId,
            capabilityId: value.capabilityId,
            actor,
            ...(value.delegationTicket ? { delegationTicket: value.delegationTicket } : {}),
            ...(value.bindingId ? { bindingId: value.bindingId } : {}),
            ...(value.bindingTransport ? { bindingTransport: value.bindingTransport } : {}),
            ...(value.metadataOnly ? { metadataOnly: true } : {}),
            ...(idempotencyKey ? { idempotencyKey } : {}),
            ...(actorCredential ? { actorCredential } : {}),
            ...(binaryBody ? { binaryBody } : {}),
            input: parseStrictJson(bytes, MAX_GATEWAY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH),
        };
    } catch {
        throw new GatewayError("invalid_input", "input must be bounded interoperable JSON");
    }
}

function snapshotActorCredential(value: GatewayInvocation["actorCredential"]): GatewayInvocation["actorCredential"] {
    if (value === undefined) {
        return undefined;
    }
    if (
        !value ||
        (value.kind !== "bearer" && value.kind !== "session") ||
        Object.keys(value).some((field) => field !== "kind" && field !== "token") ||
        typeof value.token !== "string" ||
        value.token.length === 0 ||
        value.token.length > 4_096 ||
        /[\x00-\x20\x7f]/u.test(value.token)
    ) {
        throw new GatewayError("invalid_input", "actor credential is invalid");
    }
    return { kind: value.kind, token: value.token };
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
            requireActorFields(actor, ["kind", "subjectId", "authorizationRevision"]);
            requireId(actor.subjectId);
            if (
                actor.authorizationRevision !== undefined &&
                (!Number.isSafeInteger(actor.authorizationRevision) || actor.authorizationRevision < 0)
            ) {
                throw new GatewayError("not_authorized", "invalid actor revision");
            }
            return {
                kind: actor.kind,
                subjectId: actor.subjectId,
                ...(actor.authorizationRevision === undefined
                    ? {}
                    : { authorizationRevision: actor.authorizationRevision }),
            };
        case "provider":
            requireActorFields(actor, ["kind", "installationId", "credentialFingerprint"]);
            requireId(actor.installationId);
            if (
                typeof actor.credentialFingerprint !== "string" ||
                !/^[a-f0-9]{64}$/.test(actor.credentialFingerprint)
            ) {
                throw new GatewayError("not_authorized", "Provider credential proof is missing");
            }
            return {
                kind: "provider",
                installationId: actor.installationId,
                credentialFingerprint: actor.credentialFingerprint,
            };
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
