import type { Collection } from "mongodb";
import type { HostingDomain } from "hosting/interfaces/state";
import type { PrimaryDomainElection } from "hosting/interfaces/primary";
import { HostingError } from "hosting/core/errors";
import { z } from "zod";
import { readDomain } from "../state";

export type CoordinatedDomain = HostingDomain & { _primaryElection?: PrimaryDomainElection };
const electionSchema = z.strictObject({
    instanceId: z.string().min(1).max(128),
    hostname: z.string().min(1).max(253),
    expectedInstanceRevision: z.int().min(1),
    expectedDomainRevision: z.int().min(1),
    token: z.uuid(),
});

export async function getPrimaryElection(domains: Collection<CoordinatedDomain>, hostname: string) {
    const row = await domains.findOne({ hostname }, { projection: { _primaryElection: 1, instanceId: 1 } });
    if (!row || row._primaryElection === undefined) {
        return null;
    }
    const election = electionSchema.parse(row._primaryElection);
    if (election.hostname !== hostname || election.instanceId !== row.instanceId) {
        throw new HostingError("UNAVAILABLE", "Persisted primary election scope is invalid");
    }
    return election;
}

export async function reservePrimaryElection(domains: Collection<CoordinatedDomain>, value: PrimaryDomainElection) {
    const candidate = electionSchema.parse(value);
    const result = await domains.updateOne(
        {
            hostname: candidate.hostname,
            instanceId: candidate.instanceId,
            state: "active",
            revision: candidate.expectedDomainRevision,
            _primaryElection: { $exists: false },
        },
        { $set: { _primaryElection: candidate } },
    );
    if (result.modifiedCount === 1) {
        return candidate;
    }
    const current = await getPrimaryElection(domains, candidate.hostname);
    if (current?.instanceId === candidate.instanceId) {
        return current;
    }
    throw new HostingError("CONFLICT", "Domain changed before its election reservation");
}

export async function finishPrimaryElection(
    domains: Collection<CoordinatedDomain>,
    election: PrimaryDomainElection,
    committed: boolean,
) {
    const row = await domains.findOneAndUpdate(
        { hostname: election.hostname, instanceId: election.instanceId, "_primaryElection.token": election.token },
        { $unset: { _primaryElection: "" }, ...(committed ? { $inc: { revision: 1 } } : {}) },
        { returnDocument: "after", projection: { _id: 0, _primaryElection: 0 } },
    );
    if (!row) {
        throw new HostingError("CONFLICT", "Primary election reservation changed");
    }
    return readDomain(row);
}
