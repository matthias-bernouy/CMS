import { lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { syncDirectory } from "../../../persistence/canonicalFile";
import { FsIntegrationRegistryCandidateStoreError } from "../../errors";
import {
    FS_INTEGRATION_REGISTRY_CANDIDATE_GLOBAL_OBJECT_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../../layout";
import {
    readCandidateAdmission,
    readCandidatePackage,
    readCandidatePolicy,
    readCandidateVerification,
    readCandidateVerificationJobResult,
} from "../../objects";
import { boundedCandidateInventory, CANDIDATE_TEMPORARY_FILE } from "../inventory/support";

const OBJECT_FILE = /^([a-f0-9]{64})\.json$/u;

export async function sweepCandidateObjects(
    layout: FsIntegrationRegistryCandidateLayout,
    references: ReadonlySet<string>,
    now: number,
    gracePeriodMs: number,
) {
    let removedObjects = 0;
    let retainedReferencedObjects = 0;
    let retainedWithinGraceObjects = 0;
    let total = 0;
    for (const inventory of objectInventories(layout)) {
        const entries = await boundedCandidateInventory(inventory.root);
        total += entries.length;
        for (const entry of entries) {
            if (CANDIDATE_TEMPORARY_FILE.test(entry.name)) {
                continue;
            }
            const match = OBJECT_FILE.exec(entry.name);
            if (!match || !entry.isFile() || entry.isSymbolicLink()) {
                corrupt(`Candidate object inventory contains unsafe entry ${entry.name}`);
            }
            const digest = match[1]!;
            if (references.has(`${inventory.kind}:${digest}`)) {
                retainedReferencedObjects += 1;
                continue;
            }
            const path = join(inventory.root, entry.name);
            if (now - (await lstat(path)).mtimeMs < gracePeriodMs) {
                retainedWithinGraceObjects += 1;
                continue;
            }
            await inventory.read(digest);
            await unlink(path);
            await syncDirectory(inventory.root);
            removedObjects += 1;
        }
    }
    if (total - removedObjects > FS_INTEGRATION_REGISTRY_CANDIDATE_GLOBAL_OBJECT_LIMIT) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "inventory_limit",
            "Referenced or grace-protected candidate objects exceed the global inventory limit",
        );
    }
    return { removedObjects, retainedReferencedObjects, retainedWithinGraceObjects };
}

function objectInventories(layout: FsIntegrationRegistryCandidateLayout) {
    return [
        { kind: "package", root: layout.packages, read: (digest: string) => readCandidatePackage(layout, digest) },
        {
            kind: "verification",
            root: layout.verifications,
            read: (digest: string) => readCandidateVerification(layout, digest),
        },
        { kind: "policy", root: layout.policies, read: (digest: string) => readCandidatePolicy(layout, digest) },
        {
            kind: "admission",
            root: layout.admissions,
            read: (digest: string) => readCandidateAdmission(layout, digest),
        },
        {
            kind: "result",
            root: layout.results,
            read: (digest: string) => readCandidateVerificationJobResult(layout, digest),
        },
    ] as const;
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}
