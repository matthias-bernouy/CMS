import type { ConformanceCall } from "../../../../interfaces/Conformance";
import { canonicalizeIJson } from "../../../protocol/canonical";
import { ReleaseValidationError } from "../../../protocol/errors";

/** Validate authored replay identity; the eventual runner compares actual results and operation IDs. */
export function validateScenarioReplay(calls: readonly ConformanceCall[], maxJsonDepth: number): void {
    const previous = new Map<string, ConformanceCall>();
    const usedKeys = new Set<string>();
    for (const [index, call] of calls.entries()) {
        const key = call.invocationKey === undefined ? undefined : invocationIdentity(call, maxJsonDepth);
        const path = `$.calls[${index}]`;
        if (key !== undefined && usedKeys.has(key) && call.replayOf === undefined) {
            fail("reusing an invocationKey for the same target and actor requires replayOf", `${path}.invocationKey`);
        }
        if (call.replayOf !== undefined) {
            const original = previous.get(call.replayOf);
            if (!original || original.expect.kind !== "success") {
                fail("replayOf must reference an earlier successful call", `${path}.replayOf`);
            }
            if (
                key === undefined ||
                call.expect.kind !== "success" ||
                original.invocationKey === undefined ||
                invocationIdentity(original, maxJsonDepth) !== key
            ) {
                fail(
                    "replay must preserve the successful target, actor, and explicit invocationKey",
                    `${path}.replayOf`,
                );
            }
            if (canonicalizeIJson(call.input, maxJsonDepth) !== canonicalizeIJson(original.input, maxJsonDepth)) {
                fail("replay must preserve the authored input", `${path}.input`);
            }
        }
        if (key !== undefined) {
            usedKeys.add(key);
        }
        previous.set(call.id, call);
    }
}

function invocationIdentity(call: ConformanceCall, maxJsonDepth: number): string {
    return canonicalizeIJson(
        [call.dependencyContractId ?? null, call.capabilityId, call.actor, call.invocationKey],
        maxJsonDepth,
    );
}

function fail(message: string, path: string): never {
    throw new ReleaseValidationError("invalid_contract", message, path);
}
