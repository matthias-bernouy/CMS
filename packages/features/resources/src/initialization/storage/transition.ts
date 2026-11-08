import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceInitializationState } from "../schemas";
import { parseResourceInitializationState, resourceInitializationError } from "../state";

export function assertInitializationTransition(
    current: ResourceInitializationState,
    input: ResourceInitializationState,
    expectedRevision: number,
) {
    const next = parseResourceInitializationState(input);
    if (
        current.instanceId !== next.instanceId ||
        current.siteId !== next.siteId ||
        current.revision !== expectedRevision ||
        next.revision !== expectedRevision + 1 ||
        !Number.isSafeInteger(next.revision) ||
        current.status === "completed" ||
        (current.status !== "pending" && next.status === "pending")
    ) {
        throw resourceInitializationError("Resource initialization revision or transition conflict", 409);
    }
    if (current.status === "pending") {
        if (
            (next.status !== "pending" &&
                (next.status !== "running" || next.review?.stateRevision !== current.revision)) ||
            canonicalizeIJson(next.progress) !== canonicalizeIJson(current.progress)
        ) {
            throw resourceInitializationError("Invalid resource initialization start", 409);
        }
    } else {
        if (
            canonicalizeIJson(next.review) !== canonicalizeIJson(current.review) ||
            ["assets", "texts", "blocs", "pages"].some((key) => {
                const name = key as "assets" | "texts" | "blocs" | "pages";
                return current.progress[name].some((id) => !next.progress[name].includes(id));
            }) ||
            (current.progress.theme && !next.progress.theme) ||
            Object.entries(current.progress.pageIds).some(([path, id]) => next.progress.pageIds[path] !== id)
        ) {
            throw resourceInitializationError("Resource initialization evidence cannot be replaced or removed", 409);
        }
    }
    return next;
}
