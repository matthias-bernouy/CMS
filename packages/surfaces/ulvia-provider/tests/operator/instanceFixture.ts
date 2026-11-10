import type { ProviderInstanceRecord } from "@bernouy/hosting/instances";

export function instanceRecord(status: ProviderInstanceRecord["status"] = "ready"): ProviderInstanceRecord {
    return {
        repository: { url: "https://repo.ulvia.fr", configured: false },

        id: "instance:one",
        idempotencyKey: "create-one",
        idempotencyFingerprint: "fingerprint",
        creationAuthority: { kind: "operator" },
        storageKey: "one",
        cmsUrl: "http://127.0.0.1:5100",
        gatewayUrl: "http://edge.internal:3000",
        label: "One",
        status,
        revision: 6,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };
}
