import type { Collection } from "mongodb";
import { randomUUID } from "node:crypto";
import type { CollectionMigrationWriteFence } from "../interfaces";
import type { MigrationDocument } from "./documents";

type MaintenanceDocument = {
    _id: string;
    maintenance?: { id: string; token: string; expiresAt: Date };
};

type WritePermitDocument = { _id: string; siteId: string; expiresAt: Date };
const LEASE_MS = 30_000;
const HEARTBEAT_MS = 10_000;
type LeaseOwner = { token: string; lost?: Error };

export class MongoCollectionMigrationWriteFence implements CollectionMigrationWriteFence {
    private readonly heartbeats = new Map<string, ReturnType<typeof setInterval>>();
    private readonly owners = new Map<string, LeaseOwner>();

    constructor(
        private readonly records: Collection<MigrationDocument>,
        private readonly maintenance: Collection<MaintenanceDocument>,
        private readonly permits: Collection<WritePermitDocument>,
    ) {}

    async init(): Promise<void> {
        await Promise.all([
            this.permits.createIndex({ siteId: 1, expiresAt: 1 }, { name: "collection_migration_permits_site" }),
            this.permits.createIndex(
                { expiresAt: 1 },
                { expireAfterSeconds: 0, name: "collection_migration_permits_ttl" },
            ),
        ]);
    }

    async claimMaintenance(siteId: string, migrationId: string): Promise<boolean> {
        await this.clearAbandonedMaintenance(siteId);
        const ownerKey = `${siteId}:${migrationId}`;
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + LEASE_MS);
        try {
            const current = await this.maintenance.findOne({ _id: siteId });
            if (current?.maintenance) {
                if (current.maintenance.id !== migrationId) {
                    return false;
                }
                const owner = this.owners.get(ownerKey);
                if (!owner?.lost && owner?.token === current.maintenance.token) {
                    await this.assertMaintenance(siteId, migrationId);
                    return this.waitForWrites(siteId);
                }
                if (current.maintenance.expiresAt.getTime() > Date.now()) {
                    return false;
                }
            }
            if (!current) {
                await this.maintenance.insertOne({
                    _id: siteId,
                    maintenance: { id: migrationId, token, expiresAt },
                });
            } else {
                const filter = current.maintenance
                    ? { _id: siteId, "maintenance.token": current.maintenance.token }
                    : { _id: siteId, maintenance: { $exists: false } };
                const result = await this.maintenance.replaceOne(filter, {
                    maintenance: { id: migrationId, token, expiresAt },
                });
                if (result.modifiedCount !== 1) {
                    return false;
                }
            }
            if ((await this.maintenance.findOne({ _id: siteId }))?.maintenance?.token !== token) {
                return false;
            }
        } catch (error) {
            if ((error as { code?: number }).code === 11000) {
                return false;
            }
            throw error;
        }
        this.startHeartbeat(siteId, migrationId, token);
        return this.waitForWrites(siteId);
    }

    async assertMaintenance(siteId: string, migrationId: string): Promise<void> {
        const key = `${siteId}:${migrationId}`;
        const owner = this.owners.get(key);
        if (!owner || owner.lost) {
            throw owner?.lost ?? leaseLostError();
        }
        const current = (await this.maintenance.findOne({ _id: siteId }))?.maintenance;
        if (current?.id !== migrationId || current.token !== owner.token || current.expiresAt.getTime() <= Date.now()) {
            this.markLeaseLost(key, leaseLostError());
            throw leaseLostError();
        }
    }

    async yieldMaintenance(siteId: string, migrationId: string): Promise<void> {
        const owner = this.owners.get(`${siteId}:${migrationId}`);
        if (owner && !owner.lost) {
            await this.maintenance.updateOne(
                { _id: siteId, "maintenance.id": migrationId, "maintenance.token": owner.token },
                { $set: { "maintenance.expiresAt": new Date(0) } },
            );
        }
        this.stopHeartbeat(siteId, migrationId);
    }

    async releaseMaintenance(siteId: string, migrationId: string): Promise<void> {
        const owner = this.owners.get(`${siteId}:${migrationId}`);
        if (owner && !owner.lost) {
            await this.maintenance.updateOne(
                { _id: siteId, "maintenance.id": migrationId, "maintenance.token": owner.token },
                { $set: {}, $unset: { maintenance: "" } },
            );
        }
        this.stopHeartbeat(siteId, migrationId);
    }

    async withWrite<T>(siteId: string, operation: () => Promise<T>): Promise<T> {
        await this.clearAbandonedMaintenance(siteId);
        if ((await this.maintenance.findOne({ _id: siteId }))?.maintenance) {
            throw maintenanceError();
        }
        const permitId = randomUUID();
        await this.permits.insertOne({ _id: permitId, siteId, expiresAt: new Date(Date.now() + LEASE_MS) });
        const heartbeat = this.permitHeartbeat(permitId);
        try {
            if ((await this.maintenance.findOne({ _id: siteId }))?.maintenance) {
                throw maintenanceError();
            }
            return await operation();
        } finally {
            clearInterval(heartbeat);
            await this.permits.deleteOne({ _id: permitId });
        }
    }

    private startHeartbeat(siteId: string, migrationId: string, token: string): void {
        this.stopHeartbeat(siteId, migrationId);
        const key = `${siteId}:${migrationId}`;
        const heartbeat = setInterval(() => {
            void this.maintenance
                .updateOne(
                    { _id: siteId, "maintenance.id": migrationId, "maintenance.token": token },
                    { $set: { "maintenance.expiresAt": new Date(Date.now() + LEASE_MS) } },
                )
                .then((result) => {
                    if (result.matchedCount !== 1) {
                        this.markLeaseLost(key, leaseLostError());
                    }
                })
                .catch((error) => this.markLeaseLost(key, leaseHeartbeatError(error)));
        }, HEARTBEAT_MS);
        heartbeat.unref?.();
        this.heartbeats.set(key, heartbeat);
        this.owners.set(key, { token });
    }

    private stopHeartbeat(siteId: string, migrationId: string): void {
        const key = `${siteId}:${migrationId}`;
        const heartbeat = this.heartbeats.get(key);
        if (heartbeat) {
            clearInterval(heartbeat);
            this.heartbeats.delete(key);
        }
        this.owners.delete(key);
    }

    private markLeaseLost(key: string, error: Error): void {
        const owner = this.owners.get(key);
        if (owner) {
            owner.lost = error;
        }
        const heartbeat = this.heartbeats.get(key);
        if (heartbeat) {
            clearInterval(heartbeat);
            this.heartbeats.delete(key);
        }
    }

    private permitHeartbeat(permitId: string): ReturnType<typeof setInterval> {
        const heartbeat = setInterval(() => {
            void this.permits
                .updateOne({ _id: permitId }, { $set: { expiresAt: new Date(Date.now() + LEASE_MS) } })
                .catch(() => undefined);
        }, HEARTBEAT_MS);
        heartbeat.unref?.();
        return heartbeat;
    }

    private async waitForWrites(siteId: string): Promise<boolean> {
        while (true) {
            await this.permits.deleteMany({ siteId, expiresAt: { $lte: new Date() } });
            if ((await count(this.permits, { siteId })) === 0) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }

    private async clearAbandonedMaintenance(siteId: string): Promise<void> {
        const document = await this.maintenance.findOne({ _id: siteId });
        if (!document?.maintenance || document.maintenance.expiresAt.getTime() > Date.now()) {
            return;
        }
        const active = await this.records.findOne({ siteId, active: true, ready: true }, { projection: { _id: 1 } });
        if (!active) {
            await this.maintenance.updateOne(
                { _id: siteId, "maintenance.token": document.maintenance.token },
                { $set: {}, $unset: { maintenance: "" } },
            );
        }
    }
}

function leaseLostError(): Error {
    return Object.assign(new Error("Collection migration maintenance ownership was lost"), { status: 409 });
}

function leaseHeartbeatError(error: unknown): Error {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    return Object.assign(new Error(`Collection migration maintenance heartbeat failed${detail}`), { status: 503 });
}

function maintenanceError(): Error {
    return Object.assign(new Error("The site is temporarily read-only during a collection migration"), {
        status: 423,
    });
}

async function count<T extends { _id: string }>(collection: Collection<T>, filter: object): Promise<number> {
    if (typeof collection.countDocuments === "function") {
        return collection.countDocuments(filter);
    }
    return (await collection.find(filter).toArray()).length;
}
