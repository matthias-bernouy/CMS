import { randomUUID } from "node:crypto";
import { HostingError } from "../errors";
import { zoneHostname, zoneCandidates } from "./hostname";
import { zoneProof } from "./proof";
import type { ControlAuthority } from "../ControlAuthority";
import type { HostingActor } from "hosting/interfaces/state";
import type { HostingZoneStore, HostingZone } from "hosting/interfaces/zones";

export class ZoneRegistry {
    constructor(
        private readonly store: HostingZoneStore,
        private readonly authority: Pick<ControlAuthority, "assertAdministrator">,
        private readonly proofSecret: string,
        private readonly verifyTxt: (name: string, value: string) => Promise<boolean>,
    ) {
        if (proofSecret.length < 32) {
            throw new TypeError("Zone proof secret must contain at least 32 characters");
        }
    }

    async claim(actor: HostingActor, value: string) {
        await this.authority.assertAdministrator(actor);
        const hostname = zoneHostname(value);
        let zone = await this.store.claimZone({
            format: "ulvia-hosting-zone/v1",
            hostname,
            controlInstanceId: actor.instanceId,
            claimId: randomUUID(),
            state: "pending",
            revision: 1,
        });
        this.assertOwner(actor, zone);
        if (zone.state === "disabled") {
            zone = await this.store.replaceZone(zone.revision, {
                ...zone,
                claimId: randomUUID(),
                state: "pending",
                revision: zone.revision + 1,
            });
        }
        return { zone, proof: zoneProof(zone, this.proofSecret) };
    }

    async verify(actor: HostingActor, value: string, expectedRevision: number) {
        await this.authority.assertAdministrator(actor);
        const zone = await this.requireZone(actor, value, expectedRevision);
        if (zone.state !== "pending") {
            throw new HostingError("CONFLICT", "Only a pending zone can be verified");
        }
        const proof = zoneProof(zone, this.proofSecret);
        if (!(await this.verifyTxt(proof.name, proof.value))) {
            throw new HostingError("DOMAIN_UNVERIFIED", "The exact zone ownership TXT record is missing");
        }
        await this.authority.assertAdministrator(actor);
        return this.store.replaceZone(expectedRevision, { ...zone, state: "verified", revision: expectedRevision + 1 });
    }

    async disable(actor: HostingActor, value: string, expectedRevision: number) {
        await this.authority.assertAdministrator(actor);
        const zone = await this.requireZone(actor, value, expectedRevision);
        if (zone.state === "disabled") {
            return zone;
        }
        return this.store.replaceZone(expectedRevision, { ...zone, state: "disabled", revision: expectedRevision + 1 });
    }

    async list(actor: HostingActor, after: string | null, limit: number) {
        await this.authority.assertAdministrator(actor);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
            throw new HostingError("INVALID_INPUT", "Zone page limit must be between 1 and 50");
        }
        return this.store.listZones({
            controlInstanceId: actor.instanceId,
            after: after === null ? null : zoneHostname(after),
            limit,
        });
    }

    async admits(actor: HostingActor, hostname: string) {
        await this.authority.assertAdministrator(actor);
        const zone = await this.store.findVerifiedZone(actor.instanceId, zoneCandidates(hostname));
        if (zone) {
            this.assertOwner(actor, zone);
        }
        return zone !== null;
    }

    private async requireZone(actor: HostingActor, value: string, expectedRevision: number) {
        const zone = await this.store.getZone(zoneHostname(value));
        if (!zone) {
            throw new HostingError("NOT_FOUND", "Hosting zone is not registered");
        }
        this.assertOwner(actor, zone);
        if (!Number.isSafeInteger(expectedRevision) || zone.revision !== expectedRevision) {
            throw new HostingError("CONFLICT", "Zone revision changed");
        }
        return zone;
    }

    private assertOwner(actor: HostingActor, zone: HostingZone) {
        if (zone.controlInstanceId !== actor.instanceId) {
            throw new HostingError("FORBIDDEN", "The zone belongs to a different Control instance");
        }
    }
}
