import type { BlocRecord } from "cms-content/blocs/interfaces/blocs";
import type { PageRoute, TPage } from "cms-content/pages/interfaces/pages";
import type { TSystem } from "cms-content/settings/interfaces/settings";

export const SYSTEM_ID = "singleton" as const;

export type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };
export type BlocRecordDoc = Omit<BlocRecord, "tag"> & { _id: string };
export type BlocDoc = BlocRecordDoc;
export type PageDeletionIntent = {
    alternativeId: string | null;
    alternativePath: string | null;
    requestedAt: Date;
};
export type PagePathUpdateIntent = {
    token: string;
    requestedAt: Date;
    phase: "preparing" | "committed";
};
export type PageDoc = WithMongoId<TPage> & {
    deletionIntent?: PageDeletionIntent;
    pathUpdateIntent?: PagePathUpdateIntent;
};
export type PageRouteDoc = Omit<PageRoute, "path"> & {
    _id: string;
    pathUpdateToken?: string;
    pageInsertToken?: string;
};
export type SystemDoc = TSystem & {
    _id: typeof SYSTEM_ID;
    settingsRevision?: number;
    activePageWrites?: number;
    activePageWritePermits?: Record<string, Date>;
    pageDeletionLock?: string;
    routeMigration?: {
        token: string;
        target: TSystem;
        previousDefaultLanguage: string;
        requestedAt: Date;
        expiresAt?: Date;
    };
};
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
        artifact: record.artifact,
        ...(record.siteDefinition ? { siteDefinition: record.siteDefinition } : {}),
    });
}

export function fromBlocDoc(document: BlocDoc | null): BlocRecord | null {
    if (!document) {
        return null;
    }
    const { _id, ...record } = structuredClone(document);
    return {
        tag: _id,
        ...record,
    };
}

export function fromPageDoc(document: PageDoc | null): TPage | null {
    if (!document) {
        return null;
    }
    const { _id, deletionIntent: _deletionIntent, pathUpdateIntent: _pathUpdateIntent, ...rest } = document;
    return {
        id: _id,
        ...rest,
        revision: Number.isSafeInteger(document.revision) ? document.revision : 1,
        visible: document.visible === true && !document.deletionIntent,
    };
}
