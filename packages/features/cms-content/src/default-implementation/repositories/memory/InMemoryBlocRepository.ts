import type { BlocListItemResponse } from "cms-content/interfaces/CmsRepository";
import type { BlocRecord, SiteBlocDefinition, SiteBlocSnapshot, TBloc, TBlocWrite } from "cms-content/interfaces/blocs";
import {
    archivedSiteDefinition,
    assertBlocRecordOwner,
    nextDraftDefinition,
    normalizeBlocWrite,
    publishedSiteRecord,
} from "cms-content/core/blocs/records";
import {
    DuplicateBlocTagError,
    SiteBlocNotFoundError,
    SiteBlocPublicationRequiredError,
} from "cms-content/core/validation/errors";
import { SiteBlocPublicationQueue } from "cms-content/core/blocs/SiteBlocPublicationQueue";
import type { SiteBlocPublicationGuard } from "cms-content/interfaces/CmsRepository";

export class InMemoryBlocRepository {
    protected readonly blocs = new Map<string, BlocRecord>();
    private readonly siteBlocPublications = new SiteBlocPublicationQueue();

    async createBloc(write: TBlocWrite): Promise<TBloc> {
        const bloc = normalizeBlocWrite(write);
        if (this.blocs.has(bloc.id)) {
            throw new DuplicateBlocTagError(bloc.id);
        }
        if (bloc.ownership.kind === "site-builder") {
            throw new SiteBlocPublicationRequiredError(bloc.id);
        }
        this.blocs.set(bloc.id, this.artifactRecord(bloc));
        return structuredClone(bloc);
    }

    async replaceBloc(write: TBlocWrite): Promise<TBloc> {
        const bloc = normalizeBlocWrite(write);
        const current = this.blocs.get(bloc.id);
        if (current) {
            assertBlocRecordOwner(current, bloc.ownership);
            if (current.ownership.kind === "site-builder") {
                throw new SiteBlocPublicationRequiredError(bloc.id);
            }
        } else if (bloc.ownership.kind === "site-builder") {
            throw new SiteBlocPublicationRequiredError(bloc.id);
        }
        this.blocs.set(bloc.id, this.artifactRecord(bloc, current));
        return structuredClone(bloc);
    }

    async getBlocRecord(tag: string): Promise<BlocRecord | null> {
        const record = this.blocs.get(tag);
        return record ? structuredClone(record) : null;
    }

    async getBlocRecords(): Promise<BlocRecord[]> {
        return structuredClone([...this.blocs.values()]);
    }

    async createSiteBloc(definition: SiteBlocDefinition): Promise<BlocRecord> {
        if (this.blocs.has(definition.tag)) {
            throw new DuplicateBlocTagError(definition.tag);
        }
        const record: BlocRecord = {
            tag: definition.tag,
            ownership: structuredClone(definition.ownership),
            artifact: null,
            siteDefinition: structuredClone(definition),
        };
        this.blocs.set(record.tag, record);
        return structuredClone(record);
    }

    async saveSiteBlocDraft(
        tag: string,
        draft: SiteBlocSnapshot,
        expectedDraftRevision: number,
    ): Promise<SiteBlocDefinition> {
        const current = this.requiredRecord(tag);
        const definition = nextDraftDefinition(current, draft, expectedDraftRevision);
        this.blocs.set(tag, { ...current, siteDefinition: definition });
        return structuredClone(definition);
    }

    async publishSiteBloc(
        tag: string,
        artifact: TBlocWrite,
        expectedDraftRevision: number,
        publicationDate?: Date,
        publicationGuard?: SiteBlocPublicationGuard,
    ): Promise<BlocRecord> {
        await publicationGuard?.assertHeld();
        const published = publishedSiteRecord(
            this.requiredRecord(tag),
            artifact,
            expectedDraftRevision,
            publicationDate,
        );
        this.blocs.set(tag, published);
        return structuredClone(published);
    }

    async archiveSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition> {
        return this.setSiteBlocArchived(tag, true, expectedDraftRevision);
    }

    async restoreSiteBloc(tag: string, expectedDraftRevision: number): Promise<SiteBlocDefinition> {
        return this.setSiteBlocArchived(tag, false, expectedDraftRevision);
    }

    withSiteBlocPublicationLock<T>(operation: (guard: SiteBlocPublicationGuard) => Promise<T>): Promise<T> {
        return this.siteBlocPublications.run(operation);
    }

    async getBlocsJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        return [...this.blocs.values()].flatMap((record) =>
            record.artifact
                ? [{ id: record.tag, editorJS: record.artifact.editorJS, viewJS: record.artifact.viewJS }]
                : [],
        );
    }

    async getBlocsList(): Promise<BlocListItemResponse[]> {
        return [...this.blocs.values()].flatMap((record) => {
            const bloc = record.artifact;
            return bloc
                ? [
                      {
                          id: record.tag,
                          name: bloc.name,
                          group: bloc.group || "",
                          description: bloc.description || "",
                          ownership: structuredClone(record.ownership),
                      },
                  ]
                : [];
        });
    }

    async getBlocViewJS(htmlTag: string): Promise<string | null> {
        return this.blocs.get(htmlTag)?.artifact?.viewJS ?? null;
    }

    async getBlocSource(htmlTag: string): Promise<Record<string, string> | null> {
        const source = this.blocs.get(htmlTag)?.artifact?.source;
        return source ? structuredClone(source) : null;
    }

    private artifactRecord(bloc: TBloc, current?: BlocRecord): BlocRecord {
        return {
            tag: bloc.id,
            ownership: structuredClone(bloc.ownership),
            artifact: structuredClone(bloc),
            ...(current?.siteDefinition ? { siteDefinition: structuredClone(current.siteDefinition) } : {}),
        };
    }

    private requiredRecord(tag: string): BlocRecord {
        const record = this.blocs.get(tag);
        if (!record) {
            throw new SiteBlocNotFoundError(tag);
        }
        return record;
    }

    private async setSiteBlocArchived(
        tag: string,
        archived: boolean,
        expectedDraftRevision: number,
    ): Promise<SiteBlocDefinition> {
        const current = this.requiredRecord(tag);
        const definition = archivedSiteDefinition(current, archived, expectedDraftRevision);
        this.blocs.set(tag, { ...current, siteDefinition: definition });
        return structuredClone(definition);
    }
}
