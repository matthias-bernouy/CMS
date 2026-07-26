import { join } from "node:path";
import type { FsIntegrationRegistryCandidateLayout } from "../../layout";
import {
    readCandidateAdmission,
    readCandidatePackage,
    readCandidatePolicy,
    readCandidateVerification,
    readCandidateVerificationJobResult,
    readCandidateCompatibilityReport,
    readCandidateStatefulSelection,
} from "../../objects";
import type { FsIntegrationRegistryCandidateRecoveryDiagnostic } from "../types";
import {
    boundedCandidateInventory,
    CANDIDATE_TEMPORARY_FILE,
    quarantineCandidatePath,
    quarantineExpiredCandidateTemporary,
} from "./support";

const OBJECT_FILE = /^([a-f0-9]{64})\.json$/u;
type CandidateObjectKind =
    | "package"
    | "verification"
    | "policy"
    | "admission"
    | "compatibility-report"
    | "stateful-selection"
    | "result";

export async function recoverObjectInventory(
    layout: FsIntegrationRegistryCandidateLayout,
    root: string,
    kind: CandidateObjectKind,
    now: string,
    grace: number,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<void> {
    for (const entry of await boundedCandidateInventory(root)) {
        const path = join(root, entry.name);
        if (CANDIDATE_TEMPORARY_FILE.test(entry.name)) {
            await quarantineExpiredCandidateTemporary(layout, path, entry.name, now, grace, diagnostics);
            continue;
        }
        const match = OBJECT_FILE.exec(entry.name);
        if (!match || !entry.isFile() || entry.isSymbolicLink()) {
            await quarantineCandidatePath(
                layout,
                `candidate-${kind}-objects`,
                entry.name,
                path,
                "quarantined_object",
                diagnostics,
            );
            continue;
        }
        try {
            await readCandidateObject(layout, kind, match[1]!);
        } catch (error) {
            await quarantineCandidatePath(
                layout,
                `candidate-${kind}-objects`,
                entry.name,
                path,
                "quarantined_object",
                diagnostics,
                error,
            );
        }
    }
}

function readCandidateObject(layout: FsIntegrationRegistryCandidateLayout, kind: CandidateObjectKind, digest: string) {
    switch (kind) {
        case "package":
            return readCandidatePackage(layout, digest);
        case "verification":
            return readCandidateVerification(layout, digest);
        case "policy":
            return readCandidatePolicy(layout, digest);
        case "admission":
            return readCandidateAdmission(layout, digest);
        case "compatibility-report":
            return readCandidateCompatibilityReport(layout, digest);
        case "stateful-selection":
            return readCandidateStatefulSelection(layout, digest);
        case "result":
            return readCandidateVerificationJobResult(layout, digest);
    }
}
