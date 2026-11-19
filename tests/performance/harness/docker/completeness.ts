import { mongoEvidence } from "./mongo-evidence";
import type { WorkInstrumentationFailure } from "../../capabilities/types";
import type { ProbeRow } from "./probe";
import type { ProfileMetrics } from "./profiler";

type CompletenessInput = Readonly<{
    healthy: boolean;
    dependenciesComplete: boolean;
    profileValid: boolean;
    operationComplete: boolean;
    rows: readonly ProbeRow[];
    calls: readonly ProbeRow[];
    bodies: readonly ProbeRow[];
    mongo: readonly ProbeRow[];
    profile: readonly ProfileMetrics[];
}>;

/** Persist bounded test-owned symbols; never retain raw records, remote errors or payloads. */
export function incompleteWorkReasons(input: CompletenessInput): WorkInstrumentationFailure[] {
    const checks: readonly (readonly [WorkInstrumentationFailure, boolean])[] = [
        ["probe-health", input.healthy],
        ["dependency-evidence", input.dependenciesComplete],
        ["profile-shape", input.profileValid],
        ["operation-witness", input.operationComplete],
        ["probe-overflow", !input.rows.some((row) => row.kind === "overflow")],
        ["network-body-count", input.bodies.length === input.calls.length],
        [
            "network-body-incomplete",
            input.bodies.every(
                (row) =>
                    row.complete === true &&
                    typeof row.bytes === "number" &&
                    Number.isFinite(row.bytes) &&
                    row.bytes >= 0,
            ),
        ],
        ["mongo-witness", input.mongo.every((command) => mongoEvidence(command, input.profile, input.rows))],
    ];
    return checks.filter(([, complete]) => !complete).map(([reason]) => reason);
}
