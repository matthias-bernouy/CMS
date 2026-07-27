import type { BlocRecord, SiteBlocDefinition, SiteBlocSnapshot, TBlocWrite } from "cms-content/interfaces/blocs";
import {
    BlocOwnershipConflictError,
    BlocRevisionConflictError,
    SiteBlocLifecycleConflictError,
    SiteBlocNotFoundError,
    SiteBlocPublishedSlotConflictError,
} from "cms-content/core/validation/errors";
import { nextSiteBlocUpdatedAt } from "cms-content/core/blocs/timestamps";
import { assertBlocOwner, normalizeBlocWrite } from "cms-content/core/blocs/ownership";

export {
    assertBlocOwner,
    assertBlocRecordOwner,
    CODE_MANAGED_BLOC_OWNERSHIP,
    isBlocOwnership,
    normalizeBlocWrite,
    sameBlocOwner,
} from "cms-content/core/blocs/ownership";

export function siteDefinition(record: BlocRecord): SiteBlocDefinition {
    const definition = record.siteDefinition;
    if (!definition || record.ownership.kind !== "site-builder") {
        throw new SiteBlocNotFoundError(record.tag);
    }
    return definition;
}

export function nextDraftDefinition(
    record: BlocRecord,
    draft: SiteBlocSnapshot,
    expectedRevision: number,
    now = new Date(),
): SiteBlocDefinition {
    const definition = activeSiteDefinition(record, "save a draft");
    assertDraftRevision(record.tag, definition, expectedRevision);
    assertPublishedSlotContract(record.tag, definition, draft);
    return {
        ...structuredClone(definition),
        draftRevision: definition.draftRevision + 1,
        draft: structuredClone(draft),
        updatedAt: nextSiteBlocUpdatedAt(definition.updatedAt, now),
    };
}

export function publishedSiteRecord(
    record: BlocRecord,
    artifactWrite: TBlocWrite,
    expectedRevision: number,
    now = new Date(),
): BlocRecord {
    const definition = activeSiteDefinition(record, "publish");
    assertDraftRevision(record.tag, definition, expectedRevision);
    const artifact = normalizeBlocWrite(artifactWrite);
    assertBlocOwner(record.tag, record.ownership, artifact.ownership);
    if (artifact.id !== record.tag) {
        throw new BlocOwnershipConflictError(record.tag);
    }
    const published = structuredClone(definition.draft);
    return {
        tag: record.tag,
        ownership: structuredClone(record.ownership),
        artifact,
        siteDefinition: {
            ...structuredClone(definition),
            publishedRevision: definition.draftRevision,
            published,
            updatedAt: nextSiteBlocUpdatedAt(definition.updatedAt, now),
        },
    };
}

export function archivedSiteDefinition(
    record: BlocRecord,
    archived: boolean,
    expectedRevision: number,
    now = new Date(),
): SiteBlocDefinition {
    const definition = siteDefinition(record);
    assertDraftRevision(record.tag, definition, expectedRevision);
    const cloned = structuredClone(definition);
    const { archivedAt: _archivedAt, ...withoutArchivedAt } = cloned;
    const updatedAt = nextSiteBlocUpdatedAt(definition.updatedAt, now);
    return {
        ...withoutArchivedAt,
        lifecycle: archived ? "archived" : "active",
        updatedAt,
        ...(archived ? { archivedAt: updatedAt } : {}),
    };
}

function assertPublishedSlotContract(tag: string, definition: SiteBlocDefinition, draft: SiteBlocSnapshot): void {
    if (!definition.published) {
        return;
    }
    const draftSlots = new Map(draft.slots.map((slot) => [slot.id, slot]));
    for (const publishedSlot of definition.published.slots) {
        const draftSlot = draftSlots.get(publishedSlot.id);
        if (!draftSlot) {
            throw new SiteBlocPublishedSlotConflictError(tag, publishedSlot.id, "removed");
        }
        if (draftSlot.slot !== publishedSlot.slot) {
            throw new SiteBlocPublishedSlotConflictError(tag, publishedSlot.id, "renamed");
        }
    }
}

export function assertDraftRevision(tag: string, definition: SiteBlocDefinition, expectedRevision: number): void {
    if (definition.draftRevision !== expectedRevision) {
        throw new BlocRevisionConflictError(tag, expectedRevision, definition.draftRevision);
    }
}

function activeSiteDefinition(record: BlocRecord, operation: string): SiteBlocDefinition {
    const definition = siteDefinition(record);
    if (definition.lifecycle === "archived") {
        throw new SiteBlocLifecycleConflictError(record.tag, operation);
    }
    return definition;
}
