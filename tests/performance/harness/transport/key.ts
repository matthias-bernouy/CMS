import type { CapabilityTarget } from "../../capabilities/types";

/** Explicit replay keys are fixture-owned and never serialized into performance records. */
export function requestKey(target: CapabilityTarget, supplied?: string) {
    const keyed = target.definition.behavior.effect === "command" && target.definition.behavior.idempotency === "keyed";
    if (supplied !== undefined && (!keyed || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(supplied))) {
        throw new Error("Invalid performance idempotency key");
    }
    return keyed ? (supplied ?? crypto.randomUUID()) : undefined;
}
