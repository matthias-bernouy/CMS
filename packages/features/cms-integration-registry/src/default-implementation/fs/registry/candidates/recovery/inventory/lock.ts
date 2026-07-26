import { lstat } from "node:fs/promises";
import type { FsIntegrationRegistryCandidateLayout } from "../../layout";
import { candidateMutationLockPath } from "../../store/lock";
import type { FsIntegrationRegistryCandidateRecoveryDiagnostic } from "../types";
import { isNodeError, quarantineCandidatePath } from "./support";

export async function recoverCandidateMutationLock(
    layout: FsIntegrationRegistryCandidateLayout,
    now: string,
    grace: number,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<void> {
    const path = candidateMutationLockPath(layout);
    let metadata;
    try {
        metadata = await lstat(path);
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return;
        }
        throw error;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        await quarantineCandidatePath(
            layout,
            "candidate-mutation-lock",
            "unsafe-lock",
            path,
            "quarantined_lock",
            diagnostics,
        );
        return;
    }
    if (Date.parse(now) - metadata.mtimeMs < grace) {
        throw new Error("Candidate recovery found a recent mutation lock and refuses to race its owner");
    }
    await quarantineCandidatePath(
        layout,
        "candidate-mutation-lock",
        "abandoned-lock",
        path,
        "quarantined_lock",
        diagnostics,
    );
}
