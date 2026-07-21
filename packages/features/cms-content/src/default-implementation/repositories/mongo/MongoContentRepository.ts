import { randomUUIDv7 } from "bun";
import type { OptionalUnlessRequiredId } from "mongodb";
import type { BlocListItemResponse, PageLink } from "cms-content/interfaces/CmsRepository";
import type { TBloc } from "cms-content/interfaces/blocs";
import type { TPage } from "cms-content/interfaces/pages";
import { DuplicateBlocTagError } from "cms-content/core/validation/errors";
import { isPublishedPage } from "cms-content/core/lifecycle/publication";
import { MongoRepositoryStorage } from "cms-content/default-implementation/repositories/mongo/MongoRepositoryStorage";
import { type BlocDoc, fromPageDoc, toDoc } from "cms-content/default-implementation/repositories/mongo/documents";

export class MongoContentRepository extends MongoRepositoryStorage {
    async createBloc(bloc: TBloc): Promise<TBloc> {
        try {
            await this.blocs.insertOne(toDoc(bloc) as OptionalUnlessRequiredId<BlocDoc>);
        } catch (error) {
            if ((error as { code?: number }).code === 11000) {
                throw new DuplicateBlocTagError(bloc.id);
            }
            throw error;
        }
        return bloc;
    }

    async replaceBloc(bloc: TBloc): Promise<TBloc> {
        await this.blocs.replaceOne({ _id: bloc.id }, toDoc(bloc), { upsert: true });
        return bloc;
    }

    async getBlocsJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        const documents = await this.blocs.find({}, { projection: { editorJS: 1, viewJS: 1 } }).toArray();
        return documents.map((document) => ({
            id: document._id,
            editorJS: document.editorJS,
            viewJS: document.viewJS,
        }));
    }

    async getBlocsList(): Promise<BlocListItemResponse[]> {
        const documents = await this.blocs.find({}, { projection: { name: 1, group: 1, description: 1 } }).toArray();
        return documents.map((document) => ({
            id: document._id,
            name: document.name,
            group: document.group || "",
            description: document.description || "",
        }));
    }

    async getBlocViewJS(htmlTag: string): Promise<string | null> {
        const document = await this.blocs.findOne({ _id: htmlTag }, { projection: { viewJS: 1 } });
        return document?.viewJS ?? null;
    }

    async getBlocSource(htmlTag: string): Promise<Record<string, string> | null> {
        const document = await this.blocs.findOne({ _id: htmlTag }, { projection: { source: 1 } });
        return document?.source ?? null;
    }

    async getPage(path: string): Promise<TPage | null> {
        return fromPageDoc(await this.pages.findOne({ path }));
    }

    async getAllPages(): Promise<TPage[]> {
        const documents = await this.pages.find().toArray();
        return documents.map((document) => fromPageDoc(document)!);
    }

    async getPublishedPage(path: string): Promise<TPage | null> {
        const page = await this.getPage(path);
        return isPublishedPage(page) ? page : null;
    }

    async getPublishedPages(): Promise<TPage[]> {
        return (await this.getAllPages()).filter(isPublishedPage);
    }

    async insertPage(path: string, title: string): Promise<void> {
        await this.pages.insertOne({
            _id: randomUUIDv7(),
            path,
            title,
            content: "<p></p>",
            description: "",
            tags: [],
            visible: false,
        });
    }

    async getPageById(id: string): Promise<TPage | null> {
        return fromPageDoc(await this.pages.findOne({ _id: id }));
    }

    async updatePage(page: Partial<TPage>): Promise<void> {
        if (!page.id) {
            throw new Error("updatePage requires `id` on the input.");
        }
        const { id, ...rest } = page;
        await this.pages.updateOne({ _id: id }, { $set: rest });
    }

    async deletePage(id: string): Promise<void> {
        await this.pages.deleteOne({ _id: id });
    }

    async getLinks(): Promise<PageLink[]> {
        const documents = await this.pages.find({}, { projection: { path: 1, title: 1 } }).toArray();
        return documents.map((document) => ({ path: document.path, title: document.title }));
    }
}
