import type { BlocListItemResponse, SiteBlocPublicationGuard } from "cms-content/interfaces/CmsRepository";
import type { BlocListOptions } from "cms-content/interfaces/ContentReader";
import type {
    BlocOwnership,
    BlocRecord,
    SiteBlocDefinition,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/interfaces/blocs";
import {
    archivedSiteDefinition,
    assertBlocRecordOwner,
    nextDraftDefinition,
    normalizeBlocWrite,
} from "cms-content/core/blocs/records";
import { BlocOwnershipConflictError, SiteBlocPublicationRequiredError } from "cms-content/core/validation/errors";
import {
    insertBlocRecord,
    migrateLegacyBlocs,
    replaceBlocFilter,
    replaceSiteBlocRecord,
} from "cms-content/default-implementation/repositories/mongo/blocPersistence";
import {
    projectBlocList,
    requireBlocRecord,
} from "cms-content/default-implementation/repositories/mongo/blocReadModels";
import { MongoRepositoryStorage } from "cms-content/default-implementation/repositories/mongo/MongoRepositoryStorage";
import { type BlocDoc, fromBlocDoc, toBlocDoc } from "cms-content/default-implementation/repositories/mongo/documents";
import {
    publishMongoSiteBloc,
    withMongoSiteBlocPublicationLock,
} from "cms-content/default-implementation/repositories/mongo/siteBlocPublication";

export class MongoBlocRepository extends MongoRepositoryStorage {
    override async init(): Promise<void> {
        await super.init();
        await migrateLegacyBlocs(this.blocs);
    }

    async createBloc(write: TBlocWrite): Promise<TBloc> {
        const bloc = normalizeBlocWrite(write);
        if (bloc.ownership.kind === "site-builder") {
            throw new SiteBlocPublicationRequiredError(bloc.id);
        }
        const record: BlocRecord = { tag: bloc.id, ownership: bloc.ownership, artifact: bloc };
        await insertBlocRecord(this.blocs, record);
        return structuredClone(bloc);
    }

    async replaceBloc(write: TBlocWrite): Promise<TBloc> {
        const bloc = normalizeBlocWrite(write);
        const document = await this.blocs.findOne({ _id: bloc.id });
        if (!document) {
            return this.createBloc(bloc);
        }
        const current = fromBlocDoc(document)!;
        assertBlocRecordOwner(current, bloc.ownership);
        if (current.ownership.kind === "site-builder") {
            throw new SiteBlocPublicationRequiredError(bloc.id);
        }
        const next: BlocRecord = {
            tag: bloc.id,
            ownership: structuredClone(bloc.ownership),
            artifact: structuredClone(bloc),
        };
        const filter = replaceBlocFilter(document, current);
        const result = await this.blocs.replaceOne(filter as never, toBlocDoc(next));
        if (result.matchedCount !== 1) {
            throw new BlocOwnershipConflictError(bloc.id);
        }
        return structuredClone(bloc);
    }

    async deleteBloc(tag: string, ownership: BlocOwnership): Promise<boolean> {
        const document = await this.blocs.findOne({ _id: tag });
        if (!document) {
            return false;
        }
        const current = fromBlocDoc(document)!;
        assertBlocRecordOwner(current, ownership);
        const result = await this.blocs.deleteOne(replaceBlocFilter(document, current) as never);
        if (result.deletedCount !== 1) {
            throw new BlocOwnershipConflictError(tag);
        }
        return true;
    }

    async getBlocRecord(tag: string): Promise<BlocRecord | null> {
        return fromBlocDoc(await this.blocs.findOne({ _id: tag }));
    }

    async getBlocRecords(): Promise<BlocRecord[]> {
        return (await this.blocs.find({}).toArray()).map((document) => fromBlocDoc(document)!);
    }

    async createSiteBloc(definition: SiteBlocDefinition): Promise<BlocRecord> {
        const record: BlocRecord = {
            tag: definition.tag,
            ownership: structuredClone(definition.ownership),
            artifact: null,
            siteDefinition: structuredClone(definition),
        };
        await insertBlocRecord(this.blocs, record);
        return structuredClone(record);
    }

    async saveSiteBlocDraft(
        tag: string,
        draft: SiteBlocSnapshot,
        expectedDraftRevision: number,
    ): Promise<SiteBlocDefinition> {
        const current = await requireBlocRecord(this.blocs, tag);
        const definition = nextDraftDefinition(current, draft, expectedDraftRevision);
        await replaceSiteBlocRecord(
            this.blocs,
            tag,
            current,
            { ...current, siteDefinition: definition },
            expectedDraftRevision,
        );
        return structuredClone(definition);
    }

    async publishSiteBloc(
        tag: string,
        artifact: TBlocWrite,
        expectedDraftRevision: number,
        publicationDate?: Date,
        publicationGuard?: SiteBlocPublicationGuard,
    ): Promise<BlocRecord> {
        return publishMongoSiteBloc(
            this.db,
            this.blocs,
            this.siteBlocPublicationLocks,
            tag,
            artifact,
            expectedDraftRevision,
            publicationDate,
            publicationGuard,
            (operation) => this.withSiteBlocPublicationLock(operation),
        );
    }

    async archiveSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition> {
        return this.setSiteBlocArchived(tag, true, expectedDraftRevision);
    }

    async restoreSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition> {
        return this.setSiteBlocArchived(tag, false, expectedDraftRevision);
    }

    withSiteBlocPublicationLock<T>(operation: (guard: SiteBlocPublicationGuard) => Promise<T>): Promise<T> {
        return withMongoSiteBlocPublicationLock(this.db, this.siteBlocPublicationLocks, operation);
    }

    async getBlocsJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        return (await this.getBlocRecords()).flatMap((record) =>
            record.artifact
                ? [{ id: record.tag, editorJS: record.artifact.editorJS, viewJS: record.artifact.viewJS }]
                : [],
        );
    }

    async getBlocsList(options: BlocListOptions = {}): Promise<BlocListItemResponse[]> {
        return projectBlocList(await this.getBlocRecords(), options);
    }

    async getBlocViewJS(htmlTag: string): Promise<string | null> {
        return (await this.getBlocRecord(htmlTag))?.artifact?.viewJS ?? null;
    }

    async getBlocSource(htmlTag: string): Promise<Record<string, string> | null> {
        return (await this.getBlocRecord(htmlTag))?.artifact?.source ?? null;
    }

    private async setSiteBlocArchived(
        tag: string,
        archived: boolean,
        expectedDraftRevision: number,
    ): Promise<SiteBlocDefinition> {
        const current = await requireBlocRecord(this.blocs, tag);
        const definition = archivedSiteDefinition(current, archived, expectedDraftRevision);
        await replaceSiteBlocRecord(
            this.blocs,
            tag,
            current,
            { ...current, siteDefinition: definition },
            expectedDraftRevision,
        );
        return structuredClone(definition);
    }
}
