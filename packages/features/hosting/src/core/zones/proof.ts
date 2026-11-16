import { createHmac } from "node:crypto";
import type { HostingZone } from "hosting/interfaces/zones";

export function zoneProof(zone: HostingZone, secret: string) {
    return {
        name: `_ulvia-zone.${zone.hostname}`,
        value: createHmac("sha256", secret)
            .update(JSON.stringify(["ulvia-hosting-zone/v1", zone.hostname, zone.controlInstanceId, zone.claimId]))
            .digest("base64url"),
    };
}
