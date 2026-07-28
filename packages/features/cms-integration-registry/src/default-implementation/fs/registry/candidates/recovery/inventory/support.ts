import { lstat, readdir } from "node:fs/promises";
import { quarantineRegistryPath } from "../../../recovery/quarantine";
import {
    FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../../layout";
import type { FsIntegrationRegistryCandidateRecoveryDiagnostic } from "../types";

export const CANDIDATE_TEMPORARY_FILE = /^\.[0-9a-f-]{36}\.tmp$/u;

export async function boundedCandidateInventory(root: string) {
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.length > FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
        throw new Error(`Candidate inventory exceeds ${FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT} entries`);
    }
    return entries.toSorted((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

export async function quarantineExpiredCandidateTemporary(
    layout: FsIntegrationRegistryCandidateLayout,
    path: string,
    label: string,
    now: string,
    grace: number,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<boolean> {
    const metadata = await lstat(path);
    if (Date.parse(now) - metadata.mtimeMs >= grace) {
        await quarantineCandidatePath(layout, "candidate-temporary", label, path, "quarantined_temporary", diagnostics);
        return false;
    }
    return true;
}

export async function quarantineCandidatePath(
    layout: FsIntegrationRegistryCandidateLayout,
    namespace: string,
    label: string,
    path: string,
    code: FsIntegrationRegistryCandidateRecoveryDiagnostic["code"],
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
    error?: unknown,
): Promise<void> {
    const destination = await quarantineRegistryPath(layout.registry, namespace, label, path);
    if (destination) {
        diagnostics.push({
            code,
            path,
            message: error instanceof Error ? error.message : error ? String(error) : `Quarantined ${path}`,
        });
    }
}

export function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
