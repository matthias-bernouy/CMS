import type { Collection, Db } from "mongodb";
import { HostingError } from "hosting/core/errors";
import type { HostingDomain, HostingInstallation } from "hosting/interfaces/state";
import type { HostingDomainStore, HostingInstallationStore } from "hosting/interfaces/stores";
import { readDomain, readInstallation } from "../state";

export class MongoHostingStore implements HostingDomainStore, HostingInstallationStore {
    private readonly installations: Collection<HostingInstallation>;
    private readonly domains: Collection<HostingDomain>;

    constructor(db: Db) {
        this.installations = db.collection("ulvia_hosting_installation");
        this.domains = db.collection("ulvia_hosting_domains");
    }

    async init() {
        await Promise.all([
            this.installations.createIndex({ id: 1 }, { unique: true }),
            this.domains.createIndex({ hostname: 1 }, { unique: true }),
            this.domains.createIndex({ claimId: 1 }, { unique: true }),
            this.domains.createIndex({ instanceId: 1, hostname: 1 }),
        ]);
    }

    async readInstallation() {
        const record = await this.installations.findOne({ id: "installation" }, { projection: { _id: 0 } });
        return record === null ? null : readInstallation(record);
    }

    async reserveInstallation(candidate: HostingInstallation) {
        try {
            await this.installations.updateOne(
                { id: "installation" },
                { $setOnInsert: readInstallation(candidate) },
                { upsert: true },
            );
        } catch (error) {
            if (!duplicate(error)) {
                throw error;
            }
        }
        const record = await this.readInstallation();
        if (!record) {
            throw new HostingError("UNAVAILABLE", "Hosting installation could not be read after reservation");
        }
        return record;
    }

    async bindControl(expectedRevision: number, instanceId: string) {
        const current = await this.readInstallation();
        if (
            !current ||
            current.revision !== expectedRevision ||
            (current.controlInstanceId && current.controlInstanceId !== instanceId)
        ) {
            throw new HostingError("CONFLICT", "Hosting installation revision or Control identity changed");
        }
        if (current.controlInstanceId === instanceId) {
            return current;
        }
        readInstallation({
            ...current,
            controlInstanceId: instanceId,
            phase: "provisioning",
            revision: expectedRevision + 1,
        });
        const record = await this.installations.findOneAndUpdate(
            {
                id: "installation",
                revision: expectedRevision,
                $or: [{ controlInstanceId: null }, { controlInstanceId: instanceId }],
            },
            { $set: { controlInstanceId: instanceId, phase: "provisioning" }, $inc: { revision: 1 } },
            { returnDocument: "after", projection: { _id: 0 } },
        );
        if (!record) {
            throw new HostingError("CONFLICT", "Hosting installation revision changed");
        }
        return readInstallation(record);
    }

    async completeInstallation(expectedRevision: number) {
        const current = await this.readInstallation();
        if (!current || current.phase !== "provisioning" || current.revision !== expectedRevision) {
            throw new HostingError("CONFLICT", "Hosting installation is not awaiting completion at this revision");
        }
        const record = await this.installations.findOneAndUpdate(
            { id: "installation", phase: "provisioning", revision: expectedRevision },
            { $set: { phase: "ready" }, $inc: { revision: 1 } },
            { returnDocument: "after", projection: { _id: 0 } },
        );
        if (!record) {
            throw new HostingError("CONFLICT", "Hosting installation revision changed");
        }
        return readInstallation(record);
    }

    async getDomain(hostname: string) {
        const record = await this.domains.findOne({ hostname }, { projection: { _id: 0 } });
        return record === null ? null : readDomain(record);
    }

    async claimDomain(candidate: HostingDomain) {
        const record = readDomain(candidate);
        try {
            await this.domains.insertOne({ ...record });
            return record;
        } catch (error) {
            if (!duplicate(error)) {
                throw error;
            }
        }
        const existing = await this.getDomain(record.hostname);
        if (
            !existing ||
            existing.instanceId !== record.instanceId ||
            existing.origin !== record.origin ||
            (record.creationFingerprint !== null && existing.creationFingerprint !== record.creationFingerprint)
        ) {
            throw new HostingError("CONFLICT", "Domain is already assigned");
        }
        return existing;
    }

    async replaceDomain(expectedRevision: number, candidate: HostingDomain) {
        const record = readDomain(candidate);
        if (record.revision !== expectedRevision + 1) {
            throw new HostingError("CONFLICT", "Domain replacement revision is invalid");
        }
        const updated = await this.domains.findOneAndUpdate(
            {
                hostname: record.hostname,
                instanceId: record.instanceId,
                origin: record.origin,
                claimId: record.claimId,
                creationFingerprint: record.creationFingerprint,
                revision: expectedRevision,
            },
            { $set: record },
            { returnDocument: "after", projection: { _id: 0 } },
        );
        if (!updated) {
            throw new HostingError("CONFLICT", "Domain revision or ownership changed");
        }
        return readDomain(updated);
    }

    async listDomains(input: { instanceId: string; after: string | null; limit: number }) {
        if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) {
            throw new HostingError("INVALID_INPUT", "Invalid domain page limit");
        }
        const records = await this.domains
            .find(
                { instanceId: input.instanceId, ...(input.after === null ? {} : { hostname: { $gt: input.after } }) },
                { projection: { _id: 0 } },
            )
            .sort({ hostname: 1 })
            .limit(input.limit + 1)
            .toArray();
        const items = records.slice(0, input.limit).map(readDomain);
        return { items, nextCursor: records.length > input.limit ? items.at(-1)!.hostname : null };
    }

    async scanDomains(input: { after: string | null; limit: number }) {
        if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) {
            throw new HostingError("INVALID_INPUT", "Invalid domain page limit");
        }
        const records = await this.domains
            .find(input.after === null ? {} : { hostname: { $gt: input.after } }, { projection: { _id: 0 } })
            .sort({ hostname: 1 })
            .limit(input.limit + 1)
            .toArray();
        const items = records.slice(0, input.limit).map(readDomain);
        return { items, nextCursor: records.length > input.limit ? items.at(-1)!.hostname : null };
    }
}

function duplicate(error: unknown) {
    return error !== null && typeof error === "object" && "code" in error && error.code === 11000;
}
