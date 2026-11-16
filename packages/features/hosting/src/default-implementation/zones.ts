import { z } from "zod";
import { HostingError } from "hosting/core/errors";
import { zoneHostname, zoneCandidates } from "hosting/core/zones/hostname";
import type { HostingZone } from "hosting/interfaces/zones";

const schema = z.strictObject({
    format: z.literal("ulvia-hosting-zone/v1"),
    hostname: z.string().max(241),
    controlInstanceId: z.string().min(1).max(128),
    claimId: z.uuid(),
    state: z.enum(["pending", "verified", "disabled"]),
    revision: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
});

export function readZone(value: unknown): HostingZone {
    try {
        const zone = schema.parse(value);
        if (zoneHostname(zone.hostname) !== zone.hostname) {
            throw new TypeError("Persisted zone hostname is not canonical");
        }
        return zone;
    } catch (cause) {
        throw new HostingError("UNAVAILABLE", "Persisted hosting zone is invalid", { cause });
    }
}

export function assertZoneReplacement(current: HostingZone, candidate: HostingZone, revision: number) {
    const reclaim = current.state === "disabled" && candidate.state === "pending";
    if (
        current.hostname !== candidate.hostname ||
        current.controlInstanceId !== candidate.controlInstanceId ||
        current.revision !== revision ||
        candidate.revision !== revision + 1 ||
        (reclaim ? candidate.claimId === current.claimId : candidate.claimId !== current.claimId) ||
        !(
            reclaim ||
            (current.state === "pending" && candidate.state === "verified") ||
            (current.state !== "disabled" && candidate.state === "disabled")
        )
    ) {
        throw new HostingError("CONFLICT", "Zone revision, ownership or transition changed");
    }
}

export function assertZonePage(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
        throw new HostingError("INVALID_INPUT", "Zone page limit must be between 1 and 50");
    }
}

export function assertZoneCandidates(hostnames: readonly string[]) {
    if (
        hostnames.length === 0 ||
        hostnames.length > 126 ||
        JSON.stringify(zoneCandidates(hostnames[0]!)) !== JSON.stringify(hostnames)
    ) {
        throw new HostingError("INVALID_INPUT", "Exact bounded zone candidates are required");
    }
}
