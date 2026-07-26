import { manifestDocumentByteLimit } from "../../../manifest/contract";
import type { IntegrationCompatibilityAdmissionReport } from "../../../../../interfaces/compatibility";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../../interfaces/catalog";
import type { IntegrationRegistryPublicationResult } from "../../../../../interfaces/publication";
import {
    createPublicationJournal,
    INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA,
    publicationJournalByteLimit,
    type FsIntegrationRegistryPublicationJournal,
} from "../../persistence/journal";
import { replaceCanonicalJson, writeCanonicalJsonNoReplace } from "../../persistence/canonicalFile";
import type { FsIntegrationRegistryLayout, FsIntegrationRegistryPublicationPaths } from "../../persistence/layout";
import { writeCompatibilityAdmissionReport } from "../../persistence/report";
import type { PreparedFsIntegrationRegistryCandidate } from "../candidate";
import { evaluatePublicationCompatibility } from "../compatibility";
import { nextIntegrationRegistryIndex } from "../index";
import {
    FsIntegrationRegistryRecoveryRequiredError,
    FsIntegrationRegistrySimulatedCrashError,
    type FsIntegrationRegistryPublicationConfig,
} from "../types";
import { advancePublicationJournal, notifyPublicationBoundary, publicationBoundary } from "./journalBoundary";
import { cleanupCommitted, moveVersionLive, rollbackPublication, type PublicationMutationState } from "./lifecycle";
import { buildAndSwapPublicationSnapshot } from "./snapshot";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function commitFsIntegrationRegistryPublication(
    input: Readonly<{
        config: FsIntegrationRegistryPublicationConfig;
        layout: FsIntegrationRegistryLayout;
        paths: FsIntegrationRegistryPublicationPaths;
        operationId: string;
        candidate: PreparedFsIntegrationRegistryCandidate;
        schemaDeclarationEvidence?: Parameters<typeof evaluatePublicationCompatibility>[3];
        admissionReport?: IntegrationCompatibilityAdmissionReport;
        versionStatus?: "unverified";
        verificationDigest?: string;
        validateUnderLock?: (snapshot: IntegrationRegistryCatalogSnapshot) => Promise<void>;
    }>,
): Promise<IntegrationRegistryPublicationResult> {
    const { config, layout, paths, operationId, candidate } = input;
    const capturedSnapshot = config.snapshots.current();
    await input.validateUnderLock?.(capturedSnapshot);
    const previousIndex = capturedSnapshot.getIndex(candidate.definition.kind);
    const nextIndex = nextIntegrationRegistryIndex(previousIndex, candidate.definition, candidate.package.envelope, {
        ...(input.versionStatus ? { status: input.versionStatus } : {}),
        ...(input.verificationDigest ? { verificationDigest: input.verificationDigest } : {}),
        advanceChannels: !input.versionStatus,
    });
    const report =
        input.admissionReport ??
        (await evaluatePublicationCompatibility(
            capturedSnapshot,
            candidate,
            config.compatibility,
            input.schemaDeclarationEvidence,
            config.reviewedSchemaBaselines,
        ));
    let journal: FsIntegrationRegistryPublicationJournal = {
        schema: INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA,
        operationId,
        phase: "staged",
        createdAt: config.now?.() ?? new Date().toISOString(),
        kind: candidate.definition.kind,
        version: candidate.package.envelope.version,
        digest: candidate.package.digest,
        envelope: candidate.package.envelope,
        report,
        publication: {
            disposition: input.versionStatus === "unverified" ? "unverified" : "installable",
            ...(input.verificationDigest ? { verificationDigest: input.verificationDigest } : {}),
        },
        previousIndex,
        nextIndex,
    };
    const state: PublicationMutationState = {
        journalCreated: false,
        versionMoved: false,
        manifestWritten: false,
        reportWritten: false,
        indexWritten: false,
        snapshotSwapped: false,
    };
    const journalLimit = publicationJournalByteLimit(candidate.limits);
    try {
        await createPublicationJournal(paths.journal, journal, journalLimit);
        state.journalCreated = true;
        await notifyPublicationBoundary(config, journal);

        await moveVersionLive(paths, candidate.definition.kind, candidate.package.envelope.version);
        state.versionMoved = true;
        journal = await advancePublicationJournal(paths.journal, journal, "version-live", journalLimit);
        await notifyPublicationBoundary(config, journal);

        await writeCanonicalJsonNoReplace(
            paths.manifest,
            candidate.manifest.document,
            manifestDocumentByteLimit(candidate.limits),
        );
        state.manifestWritten = true;
        journal = await advancePublicationJournal(paths.journal, journal, "manifest-written", journalLimit);
        await notifyPublicationBoundary(config, journal);

        await writeCompatibilityAdmissionReport(paths.report, report);
        state.reportWritten = true;
        journal = await advancePublicationJournal(paths.journal, journal, "report-written", journalLimit);
        await notifyPublicationBoundary(config, journal);

        await replaceCanonicalJson(paths.index, nextIndex, MAX_INDEX_DOCUMENT_BYTES);
        state.indexWritten = true;
        journal = await advancePublicationJournal(paths.journal, journal, "index-written", journalLimit);
        await notifyPublicationBoundary(config, journal);

        const snapshot = await buildAndSwapPublicationSnapshot(config, layout, candidate);
        state.snapshotSwapped = true;
        journal = await advancePublicationJournal(paths.journal, journal, "snapshot-swapped", journalLimit);
        await notifyPublicationBoundary(config, journal);
        await cleanupCommitted(paths);
        return {
            operationId,
            kind: candidate.definition.kind,
            version: candidate.package.envelope.version,
            digest: candidate.package.digest,
            report,
            snapshot,
        };
    } catch (error) {
        if (error instanceof FsIntegrationRegistrySimulatedCrashError) {
            throw error;
        }
        if (state.snapshotSwapped) {
            throw new FsIntegrationRegistryRecoveryRequiredError(publicationBoundary(journal), error);
        }
        try {
            await rollbackPublication(paths, previousIndex, state);
        } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], "Integration registry publication and rollback failed");
        }
        throw error;
    }
}
