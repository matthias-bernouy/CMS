import { randomUUID } from "node:crypto";
import { trimIntegrationRuns } from "./runRetention";
import type { IntegrationImportResult } from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallation, IntegrationRun } from "../../../interfaces/IntegrationInstallation";

export function appendRun(
    installation: IntegrationInstallation,
    run: IntegrationRun,
    patch: Partial<
        Pick<
            IntegrationInstallation,
            | "status"
            | "artifacts"
            | "answersSnapshot"
            | "secretRefs"
            | "secretInputs"
            | "label"
            | "definitionVersion"
            | "definitionSnapshot"
            | "packageDigest"
            | "connectorBindings"
            | "activeResources"
        >
    >,
): IntegrationInstallation {
    return {
        ...installation,
        ...patch,
        runCount: run.runNumber,
        runs: trimIntegrationRuns([...installation.runs, run]),
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
        ...(result.connectors?.length ? { connectors: result.connectors } : {}),
    };
}

export function failedRun(runNumber: number, startedAt: Date, error: unknown): IntegrationRun {
    const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof (error as { status?: unknown }).status === "number"
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
