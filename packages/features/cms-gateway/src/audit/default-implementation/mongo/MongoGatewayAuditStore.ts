import type { Db } from "mongodb";
import type { GatewayCommandAuditEvent, GatewayCommandAuditStore } from "cms-gateway/audit/interfaces/GatewayAudit";

interface GatewayCommandAuditDocument extends GatewayCommandAuditEvent {
    readonly _id: string;
}

export class MongoGatewayCommandAuditStore implements GatewayCommandAuditStore {
    readonly #collection;

    constructor(db: Db) {
        this.#collection = db.collection<GatewayCommandAuditDocument>("cms_gateway_command_audit");
    }

    async init(): Promise<void> {
        await this.#collection.createIndex({ requestId: 1, occurredAt: 1 });
        await this.#collection.createIndex({ siteId: 1, occurredAt: -1 });
    }

    async append(event: GatewayCommandAuditEvent): Promise<void> {
        await this.#collection.insertOne({ _id: event.id, ...structuredClone(event) });
    }
}
