import type { Collection, Db } from "mongodb";
import { z } from "@bernouy/ulvia-sdk";
import type { TemplateRecord, TemplateStore, TemplateView } from "email-templates/interfaces/TemplateStore";
import { decodeRecord, decodePublication, decodeView, options } from "./records";
import type { StoredTemplate, StoredPublication } from "./records";
import { publishTemplate } from "./publish";

export class MongoTemplateStore implements TemplateStore {
    private readonly models: Collection<StoredTemplate>;
    private readonly publications: Collection<StoredPublication>;
    constructor(db: Db) {
        this.models = db.collection<StoredTemplate>("email_templates_v1");
        this.publications = db.collection<StoredPublication>("email_template_publications_v1");
    }
    async init() {
        await this.models.createIndex({ archived: 1, _id: 1 });
    }
    async view(id: string): Promise<TemplateView | null> {
        const row = await this.models.findOne(
            { _id: id },
            { ...options, projection: { pendingPublication: 0, lastMutation: 0 } },
        );
        return row ? (decodeView(row) as TemplateView) : null;
    }
    async publication(id: string, version: number) {
        const model = await this.models.findOne(
            { _id: id, latestVersion: { $gte: version } },
            { ...options, projection: { id: 1, format: 1, locale: 1, archived: 1 } },
        );
        if (!model) {
            return null;
        }
        if (model._id !== model.id || model.format !== "ulvia-email-template/v1") {
            throw new TypeError("Invalid email template identity or format");
        }
        const row = await this.publications.findOne({ _id: `${id}@${version}` }, options);
        if (!row) {
            throw new TypeError("A committed email publication is missing");
        }
        const publication = decodePublication(row);
        if (publication.templateId !== id || publication.version !== version || publication.locale !== model.locale) {
            throw new TypeError("Email publication crossed its model scope");
        }
        return {
            locale: publication.locale,
            archived: z.boolean().parse(model.archived),
            content: publication.content,
        };
    }
    async get(id: string): Promise<TemplateRecord | null> {
        const row = await this.models.findOne({ _id: id }, options);
        return row ? decodeRecord(row) : null;
    }
    async create(record: TemplateRecord) {
        try {
            await this.models.insertOne({ ...record, _id: record.id });
            return true;
        } catch (error) {
            if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) {
                throw error;
            }
            return false;
        }
    }
    publish(record: TemplateRecord, expectedRevision: number) {
        return publishTemplate(this.models, this.publications, record, expectedRevision);
    }
    async replace(record: TemplateRecord, expectedRevision: number) {
        return (
            (
                await this.models.updateOne(
                    { _id: record.id, revision: expectedRevision, pendingPublication: { $exists: false } },
                    { $set: record },
                    options,
                )
            ).matchedCount === 1
        );
    }
    async list(input: Parameters<TemplateStore["list"]>[0]) {
        const rows = await this.models
            .find(
                {
                    ...(input.after ? { _id: { $gt: input.after } } : {}),
                    ...(input.includeArchived ? {} : { archived: false }),
                },
                {
                    ...options,
                    projection: {
                        _id: 1,
                        format: 1,
                        id: 1,
                        name: 1,
                        description: 1,
                        locale: 1,
                        revision: 1,
                        archived: 1,
                        latestVersion: 1,
                        origin: 1,
                    },
                },
            )
            .sort({ _id: 1 })
            .limit(input.limit + 1)
            .toArray();
        const items = rows.slice(0, input.limit).map((row) => decodeView(row, true));
        return { items, ...(rows.length > input.limit ? { next: items.at(-1)!.id } : {}) };
    }
}
