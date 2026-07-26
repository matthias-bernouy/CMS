import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import { quarantineRegistryPath } from "../../recovery/quarantine";
import { readCurrentCandidateRecord } from "../history";
import {
    assertCandidateId,
    FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../layout";
import { readFsIntegrationRegistryCandidateObjects, readPackage, readVerification } from "../objects";
import { FsIntegrationRegistryCandidateStore } from "../store";
import { recoverCandidateState } from "./state";
import type { FsIntegrationRegistryCandidateRecoveryDiagnostic } from "./types";

const OBJECT_FILE = /^([a-f0-9]{64})\.json$/u;
const TEMPORARY_FILE = /^\.[0-9a-f-]{36}\.tmp$/u;

export async function recoverObjectInventory(
    layout: FsIntegrationRegistryCandidateLayout,
    root: string,
    kind: "package" | "verification",
    now: string,
    grace: number,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<void> {
    for (const entry of await boundedInventory(root)) {
        const path = join(root, entry.name);
        if (TEMPORARY_FILE.test(entry.name)) {
            await quarantineExpiredTemporary(layout, path, entry.name, now, grace, diagnostics);
            continue;
        }
        const match = OBJECT_FILE.exec(entry.name);
        if (!match || !entry.isFile() || entry.isSymbolicLink()) {
            await quarantine(layout, `candidate-${kind}-objects`, entry.name, path, "quarantined_object", diagnostics);
            continue;
        }
        try {
            if (kind === "package") {
                await readPackage(layout, match[1]!);
            } else {
                await readVerification(layout, match[1]!);
            }
        } catch (error) {
            await quarantine(
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

export async function recoverCandidateInventory(
    layout: FsIntegrationRegistryCandidateLayout,
    store: FsIntegrationRegistryCandidateStore,
    now: string,
    grace: number,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<void> {
    for (const entry of await boundedInventory(layout.records)) {
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
            await quarantine(
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
    for (const entry of await boundedInventory(root)) {
        if (TEMPORARY_FILE.test(entry.name)) {
            inFlightWrite =
                (await quarantineExpiredTemporary(
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

async function quarantineExpiredTemporary(
    layout: FsIntegrationRegistryCandidateLayout,
    path: string,
    label: string,
    now: string,
    grace: number,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<boolean> {
    const metadata = await lstat(path);
    if (Date.parse(now) - metadata.mtimeMs >= grace) {
        await quarantine(layout, "candidate-temporary", label, path, "quarantined_temporary", diagnostics);
        return false;
    }
    return true;
}

async function boundedInventory(root: string) {
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.length > FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
        throw new Error(`Candidate inventory exceeds ${FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT} entries`);
    }
    return entries.toSorted((left, right) => compareText(left.name, right.name));
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

async function quarantine(
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
            message: error ? errorMessage(error) : `Quarantined unsafe candidate entry ${path}`,
        });
    }
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
