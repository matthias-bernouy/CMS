import type { CapabilityErrorDefinition } from "../../../interfaces/ContractRelease";
import { major, type CapabilityChange } from "./changes";
import { compareSchema } from "./schema";

/** Error categories remain stable; their details follow the same projection rules as successful outputs. */
export function compareErrors(
    previous: readonly CapabilityErrorDefinition[],
    next: readonly CapabilityErrorDefinition[],
    path: string,
    maxJsonDepth: number,
): readonly CapabilityChange[] {
    const after = new Map(next.map((error) => [error.code, error]));
    if (previous.length !== next.length || previous.some(({ code }) => !after.has(code))) {
        return [major("capability_changed", path, "declared error codes changed")];
    }
    const changes: CapabilityChange[] = [];
    for (const before of previous) {
        const replacement = after.get(before.code)!;
        const location = `${path}[${JSON.stringify(before.code)}]`;
        if (before.retryable !== replacement.retryable) {
            changes.push(major("capability_changed", `${location}.retryable`, "error retry behavior changed"));
        }
        if (before.output && replacement.output) {
            const change = compareSchema(
                before.output,
                replacement.output,
                `${location}.output`,
                "output",
                maxJsonDepth,
            );
            if (change) {
                changes.push(change);
            }
        } else if (before.output) {
            changes.push(major("schema_changed", `${location}.output`, "declared error details were removed"));
        } else if (replacement.output) {
            changes.push({
                code: "schema_changed",
                path: `${location}.output`,
                message: "error details were added compatibly",
                requiredBump: "minor",
            });
        }
    }
    return changes;
}
