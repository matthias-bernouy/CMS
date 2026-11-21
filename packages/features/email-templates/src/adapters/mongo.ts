import type { Collection, Db } from "mongodb";
import { z } from "@bernouy/ulvia-sdk";
import { templateSchema } from "email-templates/schemas/templates";
import { contentSchema } from "email-templates/schemas/content";
import type { TemplateRecord, TemplateStore } from "email-templates/interfaces/TemplateStore";
import { TemplateError } from "email-templates/core/errors";

const storedSchema = templateSchema.extend({
    format: z.literal("ulvia-email-template/v1"),
    publications: z.array(contentSchema).max(32),
    lastMutation: z.string().length(64),
});
type Stored = TemplateRecord & { _id: number };
const options = { maxTimeMS: 2000 };
/** One instance-private collection, 100 unique storage slots; single-document publication CAS. */
export class MongoTemplateStore implements TemplateStore {
    private readonly collection: Collection<Stored>;
    constructor(db: Db) {
        this.collection = db.collection<Stored>("email_templates_v1");
    }
    async init() {
        await this.collection.createIndex({ id: 1 }, { unique: true });
        await this.collection.createIndex({ archived: 1, id: 1 });
    }
    async view(id: string) {
        const row = await this.collection.findOne(
            { id },
            { ...options, projection: { _id: 0, publications: 0, lastMutation: 0 } },
        );
        if (!row) {
            return null;
        }
        if (row.format !== "ulvia-email-template/v1") {
            throw new TypeError("Invalid email template format");
        }
        const { format: _format, ...view } = row;
        return templateSchema.parse(view);
    }
    async publication(id: string, version: number) {
        const row = await this.collection.findOne(
            { id, latestVersion: { $gte: version } },
            {
                ...options,
                projection: { format: 1, locale: 1, archived: 1, publications: { $slice: [version - 1, 1] } },
            },
        );
        if (row && row.format !== "ulvia-email-template/v1") {
            throw new TypeError("Invalid email template format");
        }
        return row
            ? {
                  locale: z.string().min(2).max(35).parse(row.locale),
                  archived: z.boolean().parse(row.archived),
                  content: contentSchema.parse(row.publications[0]),
              }
            : null;
    }
    async get(id: string): Promise<TemplateRecord | null> {
        const stored = await this.collection.findOne({ id }, options);
        return stored ? storedSchema.parse(withoutSlot(stored)) : null;
    }
    async create(record: TemplateRecord) {
        const start = Number.parseInt(record.id.slice(0, 8), 16) % 100;
        for (let attempt = 0; attempt < 16; attempt++) {
            const rows = await this.collection
                .find({}, { ...options, projection: { _id: 1 } })
                .limit(101)
                .toArray();
            if (rows.some((row) => !Number.isInteger(row._id) || row._id < 0 || row._id >= 100) || rows.length > 100) {
                throw new TypeError("Invalid email template storage slot");
            }
            const used = new Set(rows.map((row) => row._id));
            const slot = Array.from({ length: 100 }, (_, index) => (start + index) % 100).find(
                (candidate) => !used.has(candidate),
            );
            if (slot === undefined) {
                throw new TemplateError("CAPACITY_EXCEEDED");
            }
            try {
                await this.collection.insertOne({ ...record, _id: slot });
                return true;
            } catch (error) {
                if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) {
                    throw error;
                }
                if (await this.get(record.id)) {
                    return false;
                }
            }
        }
        throw new TemplateError("CORE_UNAVAILABLE");
    }
    async replace(record: TemplateRecord, expectedRevision: number) {
        return (
            (await this.collection.updateOne({ id: record.id, revision: expectedRevision }, { $set: record }, options))
                .matchedCount === 1
        );
    }
    async list(input: Parameters<TemplateStore["list"]>[0]) {
        const rows = await this.collection
            .find(
                {
                    ...(input.after ? { id: { $gt: input.after } } : {}),
                    ...(input.includeArchived ? {} : { archived: false }),
                },
                {
                    ...options,
                    projection: {
                        _id: 0,
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
            .sort({ id: 1 })
            .limit(input.limit + 1)
            .toArray();
        const items = rows.slice(0, input.limit).map((row) => {
            if (row.format !== "ulvia-email-template/v1") {
                throw new TypeError("Invalid email template format");
            }
            const { format: _format, ...summary } = row;
            return templateSchema.omit({ draft: true }).parse(summary);
        });
        return { items, ...(rows.length > input.limit ? { next: items.at(-1)!.id } : {}) };
    }
}
function withoutSlot(value: Stored) {
    const { _id: _slot, ...record } = value;
    return record;
}
