import type { Db } from "mongodb";
import { MaintenancePages } from "../../../../src/runtime/content/maintenance/MaintenancePages";
type Row = { _id: string; html: string; resources: { contentType: string; base64: string }[]; expiresAt?: Date };
export const id = `sha256:${"a".repeat(64)}`;
export const assetPath = `/_content/maintenance/${id.slice(7)}/0`;
export const request = (path = "/article", method = "GET") => new Request(`https://site.test${path}`, { method });

export function fixture() {
    const rows = new Map<string, Row>();
    const reads: { filter: { _id: string }; projection: Record<string, unknown> }[] = [];
    const indexes: unknown[] = [];
    const collection = {
        async createIndex(keys: unknown, options: unknown) {
            indexes.push({ keys, options });
        },
        async findOne(filter: { _id: string }, options: { projection: Record<string, unknown> }) {
            reads.push({ filter, projection: options.projection });
            const row = structuredClone(rows.get(filter._id));
            if (!row) {
                return null;
            }
            const projection = options.projection;
            if (projection.html === 1) {
                return { html: row.html };
            }
            if (projection._id === 1) {
                return { _id: row._id };
            }
            const slice = (projection.resources as { $slice: [number, number] }).$slice;
            return { resources: row.resources.slice(slice[0], slice[0] + slice[1]) };
        },
        async insertOne(row: Row) {
            if (rows.has(row._id)) {
                throw Object.assign(new Error("Duplicate"), { code: 11000 });
            }
            rows.set(row._id, structuredClone(row));
        },
        async updateOne(filter: { _id: string }, update: { $set: { expiresAt: Date } }) {
            const row = rows.get(filter._id);
            if (row) {
                row.expiresAt = update.$set.expiresAt;
            }
        },
    };
    const db = { collection: () => collection } as unknown as Db;
    const pages = new MaintenancePages(db, "site");
    return { pages, rows, reads, indexes, reopen: (site = "site") => new MaintenancePages(db, site) };
}
