import { randomUUIDv7 } from "bun";
import type { PageLink } from "cms-content/interfaces/CmsRepository";
import type { TPage } from "cms-content/interfaces/pages";
import { isPublishedPage } from "cms-content/core/lifecycle/publication";
import { MongoBlocRepository } from "cms-content/default-implementation/repositories/mongo/MongoBlocRepository";
import { fromPageDoc } from "cms-content/default-implementation/repositories/mongo/documents";

export class MongoContentRepository extends MongoBlocRepository {
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
