import { randomUUID } from "node:crypto";
import { trimIntegrationRuns } from "./runRetention";
import type { IntegrationImportResult } from "../../interfaces/IntegrationImport";
import type {
    IntegrationInstance,
    IntegrationRun,
} from "../../interfaces/IntegrationInstance";

export function appendRun(
    instance: IntegrationInstance,
    run: IntegrationRun,
    patch: Partial<Pick<IntegrationInstance, "status" | "artifacts" | "answersSnapshot" | "secretRefs" | "secretInputs" | "label" | "definitionVersion">>,
): IntegrationInstance {
    return {
        ...instance,
        ...patch,
        runCount: run.runNumber,
        runs: trimIntegrationRuns([...instance.runs, run]),
        updatedAt: run.finishedAt,
    };
}

export function successRun(runNumber: number, startedAt: Date, result: IntegrationImportResult): IntegrationRun {
    return {
        id: randomUUID(),
        runNumber,
        status: "success",
        startedAt,
        finishedAt: new Date(),
        artifacts: result.artifacts,
        ...(result.secrets?.length ? { secrets: result.secrets } : {}),
    };
}

export function failedRun(runNumber: number, startedAt: Date, error: unknown): IntegrationRun {
    const status = typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : undefined;
    return {
        id: randomUUID(),
        runNumber,
        status: "failed",
        startedAt,
        finishedAt: new Date(),
        artifacts: [],
        error: {
            message: error instanceof Error ? error.message : "Integration import failed",
            ...(status ? { status } : {}),
        },
    };
}
