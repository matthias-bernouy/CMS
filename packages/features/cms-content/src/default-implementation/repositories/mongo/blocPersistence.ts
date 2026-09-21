import type { ClientSession, Collection, OptionalUnlessRequiredId } from "mongodb";
import {
    BlocLifecycleConflictError,
    BlocOwnershipConflictError,
    BlocPublicationConflictError,
    BlocRevisionConflictError,
    DuplicateBlocTagError,
    SiteBlocNotFoundError,
} from "cms-content/core/validation/errors";
import type { BlocOwnership, BlocRecord } from "cms-content/interfaces/blocs";
import { type BlocDoc, fromBlocDoc, toBlocDoc } from "cms-content/default-implementation/repositories/mongo/documents";

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

export function replaceBlocFilter(current: BlocRecord): Record<string, unknown> {
    return {
        _id: current.tag,
        ...ownershipFilter(current.ownership),
    };
}

function sameSiteOwner(ownership: BlocOwnership, definitionId: string): boolean {
    return ownership.kind === "site-builder" && ownership.definitionId === definitionId;
}

function ownershipFilter(ownership: BlocOwnership): Record<string, unknown> {
    if (ownership.kind === "site-builder") {
        return {
            "ownership.kind": ownership.kind,
            "ownership.definitionId": ownership.definitionId,
        };
    }
    return { "ownership.kind": ownership.kind };
}
