import type { Db } from "mongodb";
import type { ProviderAccessStore, ProviderCredentialRecord } from "./interfaces";

export class MongoProviderAccessStore implements ProviderAccessStore {
    private readonly credentials;
    private readonly usage;
    constructor(
        db: Db,
        private readonly now = Date.now,
    ) {
        this.credentials = db.collection<ProviderCredentialRecord & { _id: string }>(
            "cms_provider_gateway_credentials",
        );
        this.usage = db.collection<{ _id: string; calls: number; bytes: number; expiresAt: Date }>(
            "cms_provider_capability_usage",
        );
    }
    async init() {
        await this.credentials.createIndex({ installationId: 1, installationDigest: 1, pendingUntil: 1 });
        await this.usage.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }
    async findCredential(hash: string) {
        return this.credentials.findOne({ _id: hash }, { projection: { _id: 0 }, maxTimeMS: 2000 });
    }
    async registerCredential(hash: string, installationId: string, credentialRef: string) {
        await this.credentials.updateOne(
            { _id: hash },
            { $setOnInsert: { installationId, credentialRef } },
            { upsert: true, writeConcern: { w: "majority" } },
        );
    }
    async registerPendingCredential(hash: string, value: Required<ProviderCredentialRecord>) {
        await this.credentials.updateOne(
            { _id: hash, installationId: value.installationId, credentialRef: value.credentialRef },
            { $set: value },
            { upsert: true, writeConcern: { w: "majority" } },
        );
    }
    async hasPendingCredential(installationId: string, installationDigest: string, now: number) {
        return Boolean(
            await this.credentials.findOne(
                { installationId, installationDigest, pendingUntil: { $gt: now } },
                { projection: { _id: 1 }, maxTimeMS: 2000 },
            ),
        );
    }
    async consume(source: string, bytes: number, limits: { calls: number; bytes: number }) {
        const minute = Math.floor(this.now() / 60_000);
        const result = await this.usage.findOneAndUpdate(
            { _id: `${source}\0${minute}` },
            { $inc: { calls: 1, bytes }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) } },
            { upsert: true, returnDocument: "after" },
        );
        return Boolean(result && result.calls <= limits.calls && result.bytes <= limits.bytes);
    }
}
