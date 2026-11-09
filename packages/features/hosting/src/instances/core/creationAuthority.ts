import type { InstanceCreationAuthority } from "hosting/instances/interfaces/types";
import { HostingError } from "hosting/core/errors";

export class InstanceCreationAuthorityDeniedError extends HostingError {
    readonly status = 403;
    constructor() {
        super("FORBIDDEN", "Instance creation requires current Control administrator authority");
        this.name = "InstanceCreationAuthorityDeniedError";
    }
}

/** Missing persisted provenance is invalid state, never an implicit operator grant. */
export function assertInstanceCreationAuthority(value: unknown): asserts value is InstanceCreationAuthority {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Instance creation authority is missing or invalid");
    }
    if ("kind" in value && value.kind === "operator" && Object.keys(value).join(",") === "kind") {
        return;
    }
    if (
        "kind" in value &&
        value.kind === "control" &&
        Object.keys(value).sort().join(",") === "actor,kind" &&
        "actor" in value &&
        value.actor &&
        typeof value.actor === "object" &&
        !Array.isArray(value.actor) &&
        Object.keys(value.actor).sort().join(",") === "instanceId,subjectId" &&
        "instanceId" in value.actor &&
        typeof value.actor.instanceId === "string" &&
        value.actor.instanceId.length > 0 &&
        value.actor.instanceId.length <= 256 &&
        "subjectId" in value.actor &&
        typeof value.actor.subjectId === "string" &&
        value.actor.subjectId.length > 0 &&
        value.actor.subjectId.length <= 256
    ) {
        return;
    }
    throw new TypeError("Instance creation authority is missing or invalid");
}
