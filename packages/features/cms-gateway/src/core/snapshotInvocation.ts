import { canonicalIJsonBytes, parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import type { GatewayActor, GatewayInvocation } from "../interfaces/Invocation";
import { GatewayError } from "./GatewayError";

/** Snapshot caller input before the first asynchronous route or grant lookup. */
export function snapshotInvocation(value: GatewayInvocation): GatewayInvocation {
    if (!value || typeof value !== "object") {
        throw new GatewayError("invalid_input", "invocation context is required");
    }
    for (const field of [value.siteId, value.contractId, value.capabilityId]) {
        if (typeof field !== "string" || !field.trim() || field !== field.trim() || field.length > 128) {
            throw new GatewayError("invalid_input", "site, contract, and capability identifiers are required");
        }
    }
    if (!["delivery", "view", "control", "provider", "system", "conformance"].includes(value.origin)) {
        throw new GatewayError("invalid_input", "invocation origin is invalid");
    }
    const actor = snapshotActor(value.actor);
    try {
        const bytes = canonicalIJsonBytes(value.input, 64);
        if (bytes.byteLength > 1024 * 1024) {
            throw new TypeError("input exceeds gateway limit");
        }
        return {
            siteId: value.siteId,
            contractId: value.contractId,
            capabilityId: value.capabilityId,
            origin: value.origin,
            actor,
            input: parseStrictJson(bytes, 1024 * 1024, 64),
        };
    } catch {
        throw new GatewayError("invalid_input", "input must be bounded interoperable JSON");
    }
}

function snapshotActor(actor: GatewayActor): GatewayActor {
    if (!actor || typeof actor !== "object") {
        throw new GatewayError("not_authorized", "trusted actor context is required");
    }
    switch (actor.kind) {
        case "anonymous":
            return { kind: "anonymous" };
        case "user":
        case "administrator":
            requireId(actor.subjectId);
            return { kind: actor.kind, subjectId: actor.subjectId };
        case "provider":
            requireId(actor.installationId);
            return { kind: "provider", installationId: actor.installationId };
        case "system":
            requireId(actor.serviceId);
            return { kind: "system", serviceId: actor.serviceId };
        default:
            throw new GatewayError("not_authorized", "actor kind is invalid");
    }
}

function requireId(value: unknown): void {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 256) {
        throw new GatewayError("not_authorized", "actor identity is invalid");
    }
}
