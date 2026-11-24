import { ReadConcern } from "mongodb";
import type { Db } from "mongodb";
import type { EventDefinition, EventReadScope, EventDefinitionSummary } from "cms-events/interfaces/definition";
import { EventsError } from "cms-events/core/errors";
import { encodeCursor, decodeCursor } from "cms-events/core/identity";
type Definition = EventDefinition & { _id: string };
export class MongoEventDefinitions {
    constructor(
        protected readonly db: Db,
        protected readonly siteId: string,
    ) {
        this.db = db.client.db(db.databaseName, {
            writeConcern: { w: "majority", j: true },
            readConcern: new ReadConcern("majority"),
        });
    }
    async putDefinition(record: EventDefinition) {
        if (record.owner.siteId !== this.siteId) {
            throw new EventsError("FORBIDDEN");
        }
        try {
            await this.db.collection<Definition>("event_definitions").insertOne({ _id: record.id, ...record });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.definition(record.id);
            if (!existing || existing.digest !== record.digest) {
                throw new EventsError("DEFINITION_CONFLICT");
            }
            if (existing.retired) {
                throw new EventsError("DEFINITION_RETIRED");
            }
            return existing;
        }
        return record;
    }
    async definition(id: string): Promise<EventDefinition | null> {
        const row = await this.db
            .collection<Definition>("event_definitions")
            .findOne({ _id: id, "owner.siteId": this.siteId }, { maxTimeMS: 2000 });
        if (!row) {
            return null;
        }
        if (typeof row.retired !== "boolean") {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        const { _id: _id, ...definition } = row;
        return definition;
    }
    async definitions(owner: EventReadScope | null, cursor: string | undefined, limit: number) {
        const scope = {
            database: this.db.databaseName,
            owner: owner ?? { siteId: this.siteId, role: "administrator" },
        };
        if (owner && owner.siteId !== this.siteId) {
            throw new EventsError("FORBIDDEN");
        }
        const after = decodeCursor(scope, cursor);
        const rows = await this.db
            .collection<Definition>("event_definitions")
            .find(
                {
                    "owner.siteId": this.siteId,
                    ...(owner
                        ? {
                              "owner.installationId": owner.installationId,
                              ...(owner.namespace !== undefined ? { "owner.namespace": owner.namespace } : {}),
                          }
                        : {}),
                    ...(after ? { _id: { $gt: after } } : {}),
                },
                { projection: { schema: 0 }, maxTimeMS: 2000 },
            )
            .sort({ _id: 1 })
            .limit(limit + 1)
            .toArray();
        const items: EventDefinitionSummary[] = rows
            .slice(0, limit)
            .map(({ _id: _id, schema: _schema, ...summary }) => summary);
        return { items, ...(rows.length > limit ? { nextCursor: encodeCursor(scope, rows[limit - 1]!._id) } : {}) };
    }
    async retireDefinition(id: string, digest: string) {
        const result = await this.db
            .collection<Definition>("event_definitions")
            .updateOne({ _id: id, "owner.siteId": this.siteId, digest }, { $set: { retired: true } });
        return result.matchedCount === 1;
    }
}
