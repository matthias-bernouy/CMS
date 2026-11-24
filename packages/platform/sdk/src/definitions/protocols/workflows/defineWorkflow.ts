import type { WorkflowManifest } from "@bernouy/ulvia-workflows";
import { canonicalizeIJson, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";

/** Snapshot authored declarative data without filesystem, network or execution. Compile before publication. */
export function defineWorkflow<const T extends WorkflowManifest>(definition: T): T {
    const bytes = new TextEncoder().encode(canonicalizeIJson(definition));
    return freeze(parseStrictJson(bytes, 1048576, 64)) as T;
}
function freeze(value: unknown): unknown {
    if (value && typeof value === "object") {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
