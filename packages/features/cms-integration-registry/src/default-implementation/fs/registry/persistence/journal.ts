import {
    canonicalJsonBytes,
    DEFAULT_INTEGRATION_PACKAGE_LIMITS,
    type IntegrationPackageLimits,
    sha256Hex,
    validateIntegrationPackageEnvelope,
} from "@bernouy/cms-integration-packages";
import { readCanonicalJsonFile, replaceCanonicalJson, writeCanonicalJsonNoReplace } from "./canonicalFile";
import {
    type FsIntegrationRegistryPublicationJournal,
    INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA,
    parsePublicationJournalDocument,
} from "./journalDocument";

const PUBLICATION_JOURNAL_METADATA_BYTES = 8 * 1_024 * 1_024;
export const MAX_INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_BYTES =
    DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes + PUBLICATION_JOURNAL_METADATA_BYTES;

export {
    FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES,
    type FsIntegrationRegistryPublicationDisposition,
    type FsIntegrationRegistryPublicationJournal,
    type FsIntegrationRegistryPublicationPhase,
    INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA,
} from "./journalDocument";

export async function createPublicationJournal(
    path: string,
    journal: FsIntegrationRegistryPublicationJournal,
    maxBytes = MAX_INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_BYTES,
): Promise<void> {
    await writeCanonicalJsonNoReplace(path, journal, maxBytes);
}

export async function writePublicationJournal(
    path: string,
    journal: FsIntegrationRegistryPublicationJournal,
    maxBytes = MAX_INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_BYTES,
): Promise<void> {
    await replaceCanonicalJson(path, journal, maxBytes);
}

export async function readPublicationJournal(
    path: string,
    options: Readonly<{
        packageLimits: Readonly<IntegrationPackageLimits>;
        expectedOperationId: string;
        maxBytes?: number;
    }>,
): Promise<FsIntegrationRegistryPublicationJournal | null> {
    const value = await readCanonicalJsonFile(
        path,
        options.maxBytes ?? publicationJournalByteLimit(options.packageLimits),
    );
    if (value === null) {
        return null;
    }
    const journal = parsePublicationJournalDocument(value, path);
    if (!journal || journal.operationId !== options.expectedOperationId) {
        throw new Error(`Invalid integration registry publication journal: ${path}`);
    }
    const envelope = validateIntegrationPackageEnvelope(journal.envelope, {
        limits: options.packageLimits,
        requireReleaseNotes: true,
    });
    const digest = await sha256Hex(canonicalJsonBytes(envelope));
    if (
        digest !== journal.digest ||
        envelope.kind !== journal.kind ||
        envelope.version !== journal.version ||
        journal.nextIndex.kind !== journal.kind ||
        (journal.previousIndex !== null && journal.previousIndex.kind !== journal.kind)
    ) {
        throw new Error(`Integration registry publication journal identity is inconsistent: ${path}`);
    }
    return { ...journal, envelope };
}

export function publicationJournalByteLimit(limits: Readonly<IntegrationPackageLimits>): number {
    if (limits.maxDocumentBytes > Number.MAX_SAFE_INTEGER - PUBLICATION_JOURNAL_METADATA_BYTES) {
        throw new TypeError("Integration package document limit leaves no safe publication journal overhead");
    }
    return limits.maxDocumentBytes + PUBLICATION_JOURNAL_METADATA_BYTES;
}
