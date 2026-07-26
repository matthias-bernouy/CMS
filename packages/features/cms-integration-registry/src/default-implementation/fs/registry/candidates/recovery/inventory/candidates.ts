import { join } from "node:path";
import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import { readCurrentCandidateRecord } from "../../history";
import { assertCandidateId, type FsIntegrationRegistryCandidateLayout } from "../../layout";
import { readFsIntegrationRegistryCandidateObjects } from "../../objects";
import { FsIntegrationRegistryCandidateStore } from "../../store";
import { recoverCandidateState } from "../state";
import type { FsIntegrationRegistryCandidateRecoveryDiagnostic } from "../types";
import {
    boundedCandidateInventory,
    CANDIDATE_TEMPORARY_FILE,
    quarantineCandidatePath,
    quarantineExpiredCandidateTemporary,
} from "./support";

export async function recoverCandidateInventory(
    layout: FsIntegrationRegistryCandidateLayout,
    store: FsIntegrationRegistryCandidateStore,
    now: string,
    grace: number,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<void> {
    for (const entry of await boundedCandidateInventory(layout.records)) {
        const path = join(layout.records, entry.name);
        try {
            assertCandidateId(entry.name);
            if (!entry.isDirectory() || entry.isSymbolicLink()) {
                throw new Error("Candidate record entry must be a real directory");
            }
            const inFlightWrite = await recoverCandidateTemporaries(layout, path, now, grace, diagnostics);
            const record = await readCurrentCandidateRecord(layout, entry.name);
            if (!record) {
                if (inFlightWrite) {
                    continue;
                }
                throw new Error("Candidate record history is empty");
            }
            await readFsIntegrationRegistryCandidateObjects(layout, record);
            await recoverCandidateState(store, record.candidateId, now, diagnostics);
        } catch (error) {
            if (error instanceof IntegrationRegistryCandidateError && error.code === "revision_conflict") {
                continue;
            }
            await quarantineCandidatePath(
                layout,
                "candidate-records",
                entry.name,
                path,
                "quarantined_candidate",
                diagnostics,
                error,
            );
        }
    }
}

async function recoverCandidateTemporaries(
    layout: FsIntegrationRegistryCandidateLayout,
    root: string,
    now: string,
    grace: number,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<boolean> {
    let inFlightWrite = false;
    for (const entry of await boundedCandidateInventory(root)) {
        if (CANDIDATE_TEMPORARY_FILE.test(entry.name)) {
            inFlightWrite =
                (await quarantineExpiredCandidateTemporary(
                    layout,
                    join(root, entry.name),
                    entry.name,
                    now,
                    grace,
                    diagnostics,
                )) || inFlightWrite;
        }
    }
    return inFlightWrite;
}
