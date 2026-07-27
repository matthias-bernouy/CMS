import type { BlocOwnership, BlocRecord, TBlocWrite } from "cms-content/interfaces/blocs";
import { CODE_MANAGED_BLOC_OWNERSHIP, isBlocOwnership, normalizeBlocWrite } from "cms-content/core/blocs/records";
import type { TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";
import type { TTemplate } from "cms-content/interfaces/templates";

export const SYSTEM_ID = "singleton" as const;

export type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };
export type LegacyBlocDoc = WithMongoId<TBlocWrite>;
export type BlocRecordDoc = Omit<BlocRecord, "tag"> & { _id: string };
export type BlocDoc = LegacyBlocDoc | BlocRecordDoc;
export type PageDoc = WithMongoId<TPage>;
export type TemplateDoc = WithMongoId<TTemplate>;
export type SystemDoc = TSystem & { _id: typeof SYSTEM_ID };
export type SiteBlocPublicationLockDoc = {
    _id: "published-graph";
    token: string;
    expiresAt: Date;
    phase?: "leased" | "committing";
    committingAt?: Date;
};

export function toDoc<T extends { id: string }>(model: T): WithMongoId<T> {
    const { id, ...rest } = model;
    return { _id: id, ...rest } as WithMongoId<T>;
}

export function toBlocDoc(record: BlocRecord): BlocRecordDoc {
    return structuredClone({
        _id: record.tag,
        ownership: record.ownership,
        ...(record.legacyOwnershipClaim === "unclaimed" ? { legacyOwnershipClaim: record.legacyOwnershipClaim } : {}),
        artifact: record.artifact,
        ...(record.siteDefinition ? { siteDefinition: record.siteDefinition } : {}),
    });
}

export function fromBlocDoc(document: BlocDoc | null): BlocRecord | null {
    if (!document) {
        return null;
    }
    if (isBlocRecordDoc(document)) {
        const ownership = storedOwnership(document.ownership);
        const claimable =
            document.legacyOwnershipClaim === "unclaimed" &&
            isBlocOwnership(document.ownership) &&
            document.ownership.kind === "code-managed";
        return {
            tag: document._id,
            ownership,
            ...(claimable ? { legacyOwnershipClaim: "unclaimed" as const } : {}),
            artifact: document.artifact ? { ...structuredClone(document.artifact), id: document._id, ownership } : null,
            ...(document.siteDefinition ? { siteDefinition: structuredClone(document.siteDefinition) } : {}),
        };
    }

    const ownerless = document.ownership === undefined;
    const ownership = storedOwnership(document.ownership);
    const { _id, ownership: _storedOwnership, ...legacy } = document;
    const artifact = normalizeBlocWrite({ ...legacy, id: _id, ownership });
    return {
        tag: _id,
        ownership,
        ...(ownerless ? { legacyOwnershipClaim: "unclaimed" } : {}),
        artifact,
    };
}

function storedOwnership(value: unknown): BlocOwnership {
    return structuredClone(isBlocOwnership(value) ? value : CODE_MANAGED_BLOC_OWNERSHIP);
}

export function isBlocRecordDoc(document: BlocDoc): document is BlocRecordDoc {
    return Object.prototype.hasOwnProperty.call(document, "artifact");
}

export function fromPageDoc(document: PageDoc | null): TPage | null {
    if (!document) {
        return null;
    }
    const { _id, ...rest } = document;
    return { id: _id, ...rest, visible: document.visible === true };
}

export function fromTemplateDoc(document: TemplateDoc | null): TTemplate | null {
    if (!document) {
        return null;
    }
    const { _id, ...rest } = document;
    return { id: _id, ...rest };
}
