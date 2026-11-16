import type { Collection, Db } from "mongodb";
import { HostingError } from "hosting/core/errors";
import { readZone, assertZoneReplacement, assertZonePage, assertZoneCandidates } from "../zones";
import type { HostingZone, HostingZoneStore } from "hosting/interfaces/zones";

export class MongoHostingZoneStore implements HostingZoneStore {
    private readonly zones: Collection<HostingZone>;

    constructor(db: Db) {
        this.zones = db.collection("ulvia_hosting_zones");
    }

    async init() {
        await this.zones.createIndex({ hostname: 1 }, { unique: true });
        await this.zones.createIndex({ controlInstanceId: 1, hostname: 1 });
    }

    async getZone(hostname: string) {
        const record = await this.zones.findOne({ hostname }, { projection: { _id: 0 } });
        return record === null ? null : readZone(record);
    }

    async claimZone(candidate: HostingZone) {
        const zone = readZone(candidate);
        if (zone.state !== "pending" || zone.revision !== 1) {
            throw new HostingError("CONFLICT", "A new zone must await ownership verification");
        }
        try {
            await this.zones.insertOne({ ...zone });
            return zone;
        } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) {
                throw error;
            }
        }
        const current = await this.getZone(zone.hostname);
        if (!current || current.controlInstanceId !== zone.controlInstanceId) {
            throw new HostingError("CONFLICT", "Zone is already assigned");
        }
        return current;
    }

    async replaceZone(revision: number, candidate: HostingZone) {
        const zone = readZone(candidate);
        const current = await this.getZone(zone.hostname);
        if (!current) {
            throw new HostingError("CONFLICT", "Zone is not registered");
        }
        assertZoneReplacement(current, zone, revision);
        const updated = await this.zones.findOneAndUpdate(
            {
                hostname: zone.hostname,
                controlInstanceId: zone.controlInstanceId,
                revision,
                claimId: current.claimId,
                state: current.state,
                format: current.format,
            },
            { $set: zone },
            { returnDocument: "after", projection: { _id: 0 } },
        );
        if (!updated) {
            throw new HostingError("CONFLICT", "Zone revision or ownership changed");
        }
        return readZone(updated);
    }

    async listZones(input: { controlInstanceId: string; after: string | null; limit: number }) {
        assertZonePage(input.limit);
        const records = await this.zones
            .find(
                {
                    controlInstanceId: input.controlInstanceId,
                    ...(input.after === null ? {} : { hostname: { $gt: input.after } }),
                },
                { projection: { _id: 0 } },
            )
            .sort({ hostname: 1 })
            .limit(input.limit + 1)
            .toArray();
        const items = records.slice(0, input.limit).map(readZone);
        return { items, nextCursor: records.length > input.limit ? items.at(-1)!.hostname : null };
    }

    async findVerifiedZone(controlInstanceId: string, hostnames: readonly string[]) {
        assertZoneCandidates(hostnames);
        const record = await this.zones.findOne(
            { controlInstanceId, hostname: { $in: [...hostnames] }, state: "verified" },
            { projection: { _id: 0 } },
        );
        return record === null ? null : readZone(record);
    }
}
