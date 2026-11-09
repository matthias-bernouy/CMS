import { createHmac } from "node:crypto";
import type { HostingDomain } from "hosting/interfaces/state";

export function domainProof(record: HostingDomain, secret: string) {
    return {
        name: `_ulvia.${record.hostname}`,
        value: createHmac("sha256", secret)
            .update(JSON.stringify([record.hostname, record.origin, record.instanceId, record.claimId]))
            .digest("base64url"),
    };
}
