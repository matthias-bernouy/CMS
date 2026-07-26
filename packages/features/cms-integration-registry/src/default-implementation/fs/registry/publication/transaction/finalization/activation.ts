import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { identifyReleaseAdmissionDecision } from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { buildFsIntegrationRegistryCatalogSnapshot } from "../../../../snapshot/builder";
import { readJsonFile, replaceCanonicalJson } from "../../../persistence/canonicalFile";
import {
    advanceCandidateActivationJournal,
    candidateActivationJournalPath,
    candidateActivationTimestamp,
    createCandidateActivationJournal,
    listCandidateActivationJournals,
    readCandidateActivationJournal,
    removeCandidateActivationJournal,
    type CandidateActivationJournal,
    writeCandidateActivationJournal,
} from "./journal";
import type { FsIntegrationRegistryCandidateFinalizerConfig } from "./types";

const MAX_ACTIVATION_BYTES = 4 * 1_024 * 1_024;

export async function activateVerifiedCandidate(
    config: FsIntegrationRegistryCandidateFinalizerConfig,
    record: IntegrationRegistryCandidateRecord,
    decisionReference: Readonly<{ revisionId: string; digest: string }>,
): Promise<IntegrationRegistryCandidateRecord> {
    const publishing =
        record.status === "passed"
            ? await config.candidates.beginPublication(record.candidateId, {
                  expectedRevision: record.revision,
                  now: candidateActivationTimestamp(config),
              })
            : record;
    if (publishing.status === "published") {
        return publishing;
    }
    if (publishing.status !== "publishing") {
        throw new Error(`Candidate ${record.candidateId} is not ready for eligibility activation`);
    }
    return await config.mutations.runExclusive(record.kind, async () => {
        const journalPath = await candidateActivationJournalPath(config.root, record.candidateId);
        let journal = await readCandidateActivationJournal(journalPath);
        if (!journal) {
            const snapshot = config.snapshots.current();
            const location = snapshot.locateExactVersion(record.kind, record.version);
            const previousIndex = snapshot.getIndex(record.kind);
            if (!location || !previousIndex || location.package.digest !== record.packageDigest) {
                throw new Error("Candidate package is unavailable before eligibility activation");
            }
            const nextIndex = activatedIndex(previousIndex, record);
            journal = createCandidateActivationJournal({
                candidateId: record.candidateId,
                kind: record.kind,
                version: record.version,
                packageDigest: record.packageDigest,
                verificationDigest: record.verificationDigest,
                decisionRevisionId: decisionReference.revisionId,
                decisionDigest: decisionReference.digest,
                createdAt: candidateActivationTimestamp(config),
                previousIndex,
                nextIndex,
            });
            await writeCandidateActivationJournal(journalPath, journal);
            await config.afterActivationPhase?.("prepared");
        }
        assertJournalIdentity(journal, record, decisionReference);
        return await replayActivation(config, journalPath, journal);
    });
}

export async function recoverVerifiedCandidateActivations(
    config: FsIntegrationRegistryCandidateFinalizerConfig,
): Promise<readonly string[]> {
    const recovered: string[] = [];
    for (const { path, journal } of await listCandidateActivationJournals(config.root)) {
        await config.mutations.runExclusive(journal.kind, async () => {
            await replayActivation(config, path, journal);
        });
        recovered.push(journal.candidateId);
    }
    return Object.freeze(recovered);
}

async function replayActivation(
    config: FsIntegrationRegistryCandidateFinalizerConfig,
    journalPath: string,
    initial: CandidateActivationJournal,
): Promise<IntegrationRegistryCandidateRecord> {
    const candidate = await config.candidates.get(initial.candidateId);
    if (!candidate || (candidate.status !== "publishing" && candidate.status !== "published")) {
        throw new Error(`Candidate ${initial.candidateId} is not in a recoverable publication state`);
    }
    assertJournalCandidate(initial, candidate);
    if (!sameIndex(activatedIndex(initial.previousIndex, candidate), initial.nextIndex)) {
        throw new Error("Candidate activation journal contains a forged eligibility transition");
    }
    await assertCurrentDecision(config, initial);
    const location = config.snapshots.current().locateExactVersion(initial.kind, initial.version);
    if (!location || location.package.digest !== initial.packageDigest) {
        throw new Error("Candidate activation package identity is absent or substituted");
    }
    const indexPath = join(location.integrationRoot, "integration.json");
    let journal = initial;
    const diskIndex = await readIndex(indexPath);
    if (!sameIndex(diskIndex, journal.previousIndex) && !sameIndex(diskIndex, journal.nextIndex)) {
        throw new Error("Candidate activation index diverged from both journal states");
    }
    if (sameIndex(diskIndex, journal.previousIndex)) {
        await replaceCanonicalJson(indexPath, journal.nextIndex, MAX_ACTIVATION_BYTES);
    }
    journal = await advanceCandidateActivationJournal(journalPath, journal, "index-written");
    await config.afterActivationPhase?.("index-written");
    await buildAndSwap(config, journal);
    journal = await advanceCandidateActivationJournal(journalPath, journal, "snapshot-swapped");
    await config.afterActivationPhase?.("snapshot-swapped");
    const current = await config.candidates.get(journal.candidateId);
    let published = current;
    if (current?.status === "publishing") {
        published = await config.candidates.completePublication(current.candidateId, {
            expectedRevision: current.revision,
            now: candidateActivationTimestamp(config),
        });
    }
    if (!published || published.status !== "published") {
        throw new Error(`Candidate ${journal.candidateId} cannot complete its publication record`);
    }
    journal = await advanceCandidateActivationJournal(journalPath, journal, "candidate-published");
    await config.afterActivationPhase?.("candidate-published");
    await removeCandidateActivationJournal(journalPath);
    return published;
}

async function assertCurrentDecision(
    config: FsIntegrationRegistryCandidateFinalizerConfig,
    journal: CandidateActivationJournal,
): Promise<void> {
    const history = await config.releaseDecisions.get(journal.kind, journal.version);
    const identified = history ? await identifyReleaseAdmissionDecision(history.current) : null;
    if (
        !history ||
        !identified ||
        !history.current.admissible ||
        history.current.packageDigest !== journal.packageDigest ||
        history.currentRevisionId !== journal.decisionRevisionId ||
        history.currentReportDigest !== journal.decisionDigest ||
        identified.digest !== journal.decisionDigest
    ) {
        throw new Error("Candidate activation decision is absent, stale, inadmissible, or substituted");
    }
}

function activatedIndex(previous: IntegrationDefinitionIndex, record: IntegrationRegistryCandidateRecord) {
    const versions = previous.versions.map((entry) => {
        if (entry.version !== record.version) {
            return entry;
        }
        if (entry.status !== "unverified" || entry.verificationDigest !== record.verificationDigest) {
            throw new Error("Candidate version is not the exact unverified release being activated");
        }
        const { status: _status, ...installable } = entry;
        return installable;
    });
    if (!versions.some((entry) => entry.version === record.version)) {
        throw new Error("Candidate version is absent from its integration index");
    }
    return parseIntegrationDefinitionIndex(
        { ...previous, latest: record.version, versions },
        `candidate-activation:${record.kind}@${record.version}`,
    );
}

async function buildAndSwap(
    config: FsIntegrationRegistryCandidateFinalizerConfig,
    journal: CandidateActivationJournal,
): Promise<void> {
    while (true) {
        const expected = config.snapshots.current();
        const next = await buildFsIntegrationRegistryCatalogSnapshot({
            root: config.root,
            packageLimits: config.packageLimits,
        });
        const location = next.locateExactVersion(journal.kind, journal.version);
        if (
            !location ||
            location.package.digest !== journal.packageDigest ||
            !sameIndex(next.getIndex(journal.kind), journal.nextIndex)
        ) {
            throw new Error("Activated candidate is absent from the validated catalog snapshot");
        }
        if (config.snapshots.compareAndSwap(expected, next)) {
            return;
        }
    }
}

async function readIndex(path: string): Promise<IntegrationDefinitionIndex | null> {
    const document = await readJsonFile(path, MAX_ACTIVATION_BYTES);
    return document ? parseIntegrationDefinitionIndex(document.value, path) : null;
}

function assertJournalIdentity(
    journal: CandidateActivationJournal,
    record: IntegrationRegistryCandidateRecord,
    decision: Readonly<{ revisionId: string; digest: string }>,
): void {
    if (
        journal.candidateId !== record.candidateId ||
        journal.kind !== record.kind ||
        journal.version !== record.version ||
        journal.packageDigest !== record.packageDigest ||
        journal.verificationDigest !== record.verificationDigest ||
        journal.decisionRevisionId !== decision.revisionId ||
        journal.decisionDigest !== decision.digest
    ) {
        throw new Error("Candidate activation journal is bound to another immutable release identity");
    }
}

function assertJournalCandidate(journal: CandidateActivationJournal, record: IntegrationRegistryCandidateRecord): void {
    if (
        journal.candidateId !== record.candidateId ||
        journal.kind !== record.kind ||
        journal.version !== record.version ||
        journal.packageDigest !== record.packageDigest ||
        journal.verificationDigest !== record.verificationDigest
    ) {
        throw new Error("Candidate activation journal does not match its immutable candidate record");
    }
}

function sameIndex(left: IntegrationDefinitionIndex | null, right: IntegrationDefinitionIndex | null): boolean {
    if (!left || !right) {
        return left === right;
    }
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}
