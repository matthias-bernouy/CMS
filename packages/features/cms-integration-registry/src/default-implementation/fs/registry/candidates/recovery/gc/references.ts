import { join } from "node:path";
import { readIntegrationRegistryCandidateRecord } from "../../document";
import { FsIntegrationRegistryCandidateStoreError } from "../../errors";
import { candidateRevisionPath, type FsIntegrationRegistryCandidateLayout } from "../../layout";
import { readCandidatePlanBinding } from "../../objects";
import { boundedCandidateInventory, CANDIDATE_TEMPORARY_FILE } from "../inventory/support";

const REVISION_FILE = /^(\d{16})\.json$/u;

export async function collectCandidateObjectReferences(
    layout: FsIntegrationRegistryCandidateLayout,
): Promise<Set<string>> {
    const references = new Set<string>();
    for (const candidate of await boundedCandidateInventory(layout.records)) {
        if (!candidate.isDirectory() || candidate.isSymbolicLink()) {
            corrupt(`Candidate inventory contains unsafe entry ${candidate.name}`);
        }
        const root = join(layout.records, candidate.name);
        for (const revision of await boundedCandidateInventory(root)) {
            if (CANDIDATE_TEMPORARY_FILE.test(revision.name)) {
                throw new FsIntegrationRegistryCandidateStoreError(
                    "mutation_locked",
                    `Candidate ${candidate.name} has an in-flight record write; garbage collection is deferred`,
                );
            }
            const match = REVISION_FILE.exec(revision.name);
            if (!match || !revision.isFile() || revision.isSymbolicLink()) {
                corrupt(`Candidate ${candidate.name} contains unsafe revision ${revision.name}`);
            }
            const record = await readIntegrationRegistryCandidateRecord(
                candidateRevisionPath(layout, candidate.name, Number(match[1])),
            );
            if (!record || record.candidateId !== candidate.name) {
                corrupt(`Candidate ${candidate.name} has an inconsistent persisted revision`);
            }
            references.add(`package:${record.packageDigest}`);
            references.add(`verification:${record.verificationDigest}`);
            addOptionalReference(references, "policy", record.policyDigest);
            addOptionalReference(references, "admission", record.admissionInputDigest);
            addOptionalReference(references, "compatibility-report", record.compatibilityReportDigest);
            addOptionalReference(references, "stateful-selection", record.statefulChangeSelectionDigest);
            for (const digest of record.migrationInputDigests ?? []) {
                references.add(`migration-input:${digest}`);
            }
            addOptionalReference(references, "result", record.admissionJobResultDigest);
        }
        const plan = await readCandidatePlanBinding(layout, candidate.name);
        if (plan) {
            references.add(`compatibility-report:${plan.compatibilityReportDigest}`);
            references.add(`stateful-selection:${plan.statefulChangeSelectionDigest}`);
        }
    }
    return references;
}

function addOptionalReference(references: Set<string>, kind: string, digest: string | undefined): void {
    if (digest) {
        references.add(`${kind}:${digest}`);
    }
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}
