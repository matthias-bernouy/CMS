import { HostingError } from "hosting/core/errors";
import { readZone, assertZoneReplacement, assertZonePage, assertZoneCandidates } from "../zones";
import type { HostingZone, HostingZoneStore } from "hosting/interfaces/zones";

export class InMemoryHostingZoneStore implements HostingZoneStore {
    private readonly zones = new Map<string, HostingZone>();

    async getZone(hostname: string) {
        return structuredClone(this.zones.get(hostname) ?? null);
    }

    async claimZone(candidate: HostingZone) {
        const zone = readZone(candidate);
        if (zone.state !== "pending" || zone.revision !== 1) {
            throw new HostingError("CONFLICT", "A new zone must await ownership verification");
        }
        const current = this.zones.get(zone.hostname);
        if (current && current.controlInstanceId !== zone.controlInstanceId) {
            throw new HostingError("CONFLICT", "Zone is already assigned");
        }
        if (!current) {
            this.zones.set(zone.hostname, zone);
        }
        return structuredClone(current ?? zone);
    }

    async replaceZone(revision: number, candidate: HostingZone) {
        const zone = readZone(candidate);
        const current = this.zones.get(zone.hostname);
        if (!current) {
            throw new HostingError("CONFLICT", "Zone is not registered");
        }
        assertZoneReplacement(current, zone, revision);
        this.zones.set(zone.hostname, zone);
        return structuredClone(zone);
    }

    async listZones(input: { controlInstanceId: string; after: string | null; limit: number }) {
        assertZonePage(input.limit);
        const records = [...this.zones.values()]
            .filter(
                (zone) =>
                    zone.controlInstanceId === input.controlInstanceId &&
                    (input.after === null || zone.hostname > input.after),
            )
            .sort((a, b) => (a.hostname < b.hostname ? -1 : a.hostname === b.hostname ? 0 : 1))
            .slice(0, input.limit + 1);
        const items = records.slice(0, input.limit);
        return structuredClone({ items, nextCursor: records.length > input.limit ? items.at(-1)!.hostname : null });
    }

    async findVerifiedZone(controlInstanceId: string, hostnames: readonly string[]) {
        assertZoneCandidates(hostnames);
        for (const hostname of hostnames) {
            const zone = this.zones.get(hostname);
            if (zone?.controlInstanceId === controlInstanceId && zone.state === "verified") {
                return structuredClone(zone);
            }
        }
        return null;
    }
}
