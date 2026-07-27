import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyMigrationVerificationInput,
    validateMigrationJobResultForInput,
    type MigrationJobResultV1,
    type MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";
import type { MigrationVerificationExecutionInput } from "../types";
import {
    migrationVerificationCause,
    migrationVerificationPhase,
    type MigrationVerificationPhase,
} from "../execution/phases";
import { infrastructureEvidence, unsupportedCutover, unsupportedEvidence } from "./evidence";

export async function failedResult(
    input: MigrationVerificationInputV1,
    attempt: MigrationVerificationExecutionInput["attempt"],
    environmentDigest: string,
    error: unknown,
): Promise<MigrationJobResultV1> {
    const identified = await identifyMigrationVerificationInput(input);
    const phase = migrationVerificationPhase(error);
    const infrastructure = infrastructureFailure(migrationVerificationCause(error));
    const code = `postgres-${phase}-${infrastructure ? "infrastructure-failure" : "proof-failed"}`;
    const digest = await sha256Hex(canonicalJsonBytes({ code, migrationInputDigest: identified.digest, phase }));
    const notObserved = unsupportedEvidence(code);
    const unavailable = infrastructure ? infrastructureEvidence(code) : notObserved;
    const failed = { status: "failed" as const, evidenceDigests: [digest], diagnosticCodes: [code] };
    const result: MigrationJobResultV1 = {
        schema: "cms.integration.migration-job-result.v1",
        ...attempt,
        migrationInputDigest: identified.digest,
        runnerDigest: input.runner.digest,
        environmentDigest,
        observations: {
            freshTarget: {
                ...(phase === "fresh" ? (infrastructure ? unavailable : failed) : notObserved),
                functionDigests: [],
            },
            migratedTarget: {
                ...(migratedTargetFailed(phase) ? (infrastructure ? unavailable : failed) : notObserved),
                functionDigests: [],
            },
            equivalence: { ...(phase === "equivalence" ? unavailable : notObserved), differences: [] },
            ledger: { ...(phase === "migration" ? unavailable : notObserved), rows: [] },
            replay: phase === "replay" ? unavailable : notObserved,
            failureInjections: [],
            resumptions: [],
            cutover: unsupportedCutover(input, infrastructure ? "infrastructure-failure" : "not-supported", code),
        },
    };
    return (await validateMigrationJobResultForInput(result, input, attempt)).result;
}

function infrastructureFailure(error: unknown): boolean {
    const postgres = error as { errno?: unknown; code?: unknown };
    const code = typeof postgres.errno === "string" ? postgres.errno : postgres.code;
    return (
        typeof code === "string" &&
        (/^08/u.test(code) ||
            [
                "53300",
                "57P01",
                "57P02",
                "57P03",
                "ECONNREFUSED",
                "ECONNRESET",
                "EHOSTUNREACH",
                "ENETUNREACH",
                "EPIPE",
                "ETIMEDOUT",
            ].includes(code))
    );
}

function migratedTargetFailed(phase: MigrationVerificationPhase): boolean {
    return phase === "source" || phase === "migration";
}
