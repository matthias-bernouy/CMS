import type { ClientSession, Collection, OptionalUnlessRequiredId } from "mongodb";
import { isBlocOwnership } from "cms-content/core/blocs/records";
import {
    BlocLifecycleConflictError,
    BlocOwnershipConflictError,
    BlocPublicationConflictError,
    BlocRevisionConflictError,
    DuplicateBlocTagError,
    SiteBlocNotFoundError,
} from "cms-content/core/validation/errors";
import type { BlocOwnership, BlocRecord } from "cms-content/interfaces/blocs";
import {
    type BlocDoc,
    fromBlocDoc,
    isBlocRecordDoc,
    toBlocDoc,
} from "cms-content/default-implementation/repositories/mongo/documents";

export async function migrateLegacyBlocs(blocs: Collection<BlocDoc>): Promise<void> {
    const documents = await blocs.find({}).toArray();
    await Promise.all(
        documents
            .filter((document) => !isBlocRecordDoc(document))
            .map(async (document) => {
                const migration = legacyBlocMigration(document);
                await blocs.replaceOne(migration.filter as never, migration.document);
            }),
    );
}

export async function insertBlocRecord(blocs: Collection<BlocDoc>, record: BlocRecord): Promise<void> {
    try {
        await blocs.insertOne(toBlocDoc(record) as OptionalUnlessRequiredId<BlocDoc>);
    } catch (error) {
        if ((error as { code?: number }).code === 11000) {
            throw new DuplicateBlocTagError(record.tag);
        }
        throw error;
    }
}

export async function replaceSiteBlocRecord(
    blocs: Collection<BlocDoc>,
    tag: string,
    current: BlocRecord,
    next: BlocRecord,
    expectedDraftRevision: number,
    session?: ClientSession,
): Promise<void> {
    const definitionId = next.ownership.kind === "site-builder" ? next.ownership.definitionId : "";
    const expectedDefinition = current.siteDefinition;
    if (!expectedDefinition) {
        throw new SiteBlocNotFoundError(tag);
    }
    const expectedLifecycle = expectedDefinition.lifecycle;
    const expectedPublishedRevision = expectedDefinition.publishedRevision;
    const result = await blocs.replaceOne(
        {
            _id: tag,
            "ownership.kind": "site-builder",
            "ownership.definitionId": definitionId,
            "siteDefinition.draftRevision": expectedDraftRevision,
            "siteDefinition.lifecycle": expectedLifecycle,
            "siteDefinition.publishedRevision": exactPublishedRevision(expectedPublishedRevision),
            "siteDefinition.updatedAt": { $eq: expectedDefinition.updatedAt },
        } as never,
        toBlocDoc(next),
        session ? { session } : undefined,
    );
    if (result.matchedCount === 1) {
        return;
    }
    const latest = fromBlocDoc(await blocs.findOne({ _id: tag }, session ? { session } : undefined));
    if (!latest?.siteDefinition) {
        throw new SiteBlocNotFoundError(tag);
    }
    if (!sameSiteOwner(latest.ownership, definitionId)) {
        throw new BlocOwnershipConflictError(tag);
    }
    if (latest.siteDefinition.lifecycle !== expectedLifecycle) {
        throw new BlocLifecycleConflictError(tag, expectedLifecycle, latest.siteDefinition.lifecycle);
    }
    if (latest.siteDefinition.draftRevision !== expectedDraftRevision) {
        throw new BlocRevisionConflictError(tag, expectedDraftRevision, latest.siteDefinition.draftRevision);
    }
    if (
        latest.siteDefinition.publishedRevision !== expectedPublishedRevision ||
        latest.siteDefinition.updatedAt.getTime() !== expectedDefinition.updatedAt.getTime()
    ) {
        throw new BlocPublicationConflictError(tag, expectedPublishedRevision, latest.siteDefinition.publishedRevision);
    }
    throw new BlocRevisionConflictError(tag, expectedDraftRevision, latest.siteDefinition.draftRevision);
}

function exactPublishedRevision(revision: number | null): number | { $eq: null; $exists: true } {
    return revision === null ? { $eq: null, $exists: true } : revision;
}

function legacyBlocMigration(document: BlocDoc) {
    const record = fromBlocDoc(document)!;
    return { filter: replaceBlocFilter(document, record), document: toBlocDoc(record) };
}

export function replaceBlocFilter(document: BlocDoc, current: BlocRecord): Record<string, unknown> {
    if (!isBlocRecordDoc(document)) {
        return {
            _id: current.tag,
            artifact: { $exists: false },
            ...(current.legacyOwnershipClaim === "unclaimed"
                ? { ownership: { $exists: false } }
                : persistedOwnershipFilter(document, current.ownership)),
        };
    }
    if (current.legacyOwnershipClaim === "unclaimed") {
        return {
            _id: current.tag,
            "ownership.kind": "code-managed",
            legacyOwnershipClaim: "unclaimed",
        };
    }
    return {
        _id: current.tag,
        ...persistedOwnershipFilter(document, current.ownership),
        legacyOwnershipClaim: { $exists: false },
    };
}

function sameSiteOwner(ownership: BlocOwnership, definitionId: string): boolean {
    return ownership.kind === "site-builder" && ownership.definitionId === definitionId;
}

function persistedOwnershipFilter(document: BlocDoc, fallback: BlocOwnership): Record<string, unknown> {
    if (isBlocOwnership(document.ownership)) {
        return ownershipFilter(fallback);
    }
    if (!Object.prototype.hasOwnProperty.call(document, "ownership")) {
        return { ownership: { $exists: false } };
    }
    return { ownership: { $eq: structuredClone(document.ownership) } };
}

function ownershipFilter(ownership: BlocOwnership): Record<string, unknown> {
    if (ownership.kind === "integration") {
        return {
            "ownership.kind": ownership.kind,
            "ownership.integrationKind": ownership.integrationKind,
            "ownership.installationId": ownership.installationId,
        };
    }
    return { "ownership.kind": ownership.kind };
}
