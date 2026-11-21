import { expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import { MongoClusterJournalReader } from "@bernouy/observability/mongo";
import { loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import { clusterJournalDirectory } from "../../../src/runtime/gateway/operator/journals";

test("operator journal resolution reads disabled and failed histories without connecting or hydrating tenants", async () => {
    const pin = (await loadOfficialFeatures()).implementations.find(
        (pin) => pin.contractId === "ulvia/cms.observability",
    )!;
    const client = new MongoClient("mongodb://127.0.0.1:1");
    let reads = 0;
    let record: ProviderInstanceRecord | null = {
        id: "instance:diagnostic",
        idempotencyKey: "diagnostic",
        idempotencyFingerprint: "diagnostic",
        creationAuthority: { kind: "operator" },
        storageKey: "diagnostic",
        cmsUrl: "https://diagnostic.example",
        gatewayUrl: "https://diagnostic.example",
        label: "Diagnostic",
        status: "ready",
        repository: { url: "https://repo.example", configured: false },
        revision: 1,
        createdAt: "2026-11-21T10:00:00.000Z",
        updatedAt: "2026-11-21T10:00:00.000Z",
        systemPlan: {
            manifest: { providerId: "ulvia/primary-provider", version: "1.9.0", digest: `sha256:${"a".repeat(64)}` },
            contracts: [pin],
        },
    };
    const directory = clusterJournalDirectory(client, {
        get: async () => {
            reads++;
            return record;
        },
    });
    try {
        for (const status of ["ready", "disabled", "failed", "upgrading"] as const) {
            record = { ...record!, status };
            expect(await directory.open(record.id)).toBeInstanceOf(MongoClusterJournalReader);
        }
        record = { ...record!, systemPlan: undefined };
        await expect(directory.open(record.id)).rejects.toMatchObject({ status: "unsupported" });
        record = null;
        await expect(directory.open("instance:missing")).rejects.toMatchObject({ status: "unavailable" });
        expect(reads).toBe(6);
    } finally {
        await client.close();
    }
});
