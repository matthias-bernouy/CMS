import {
    EnvelopeSecretCrypto,
    LocalKekRingProvider,
    rotateDekWrapping,
    verifyDekKeyAvailability,
} from "@bernouy/envelope-crypto";
import { MongoDekRepository } from "@bernouy/envelope-crypto/mongo";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import type { RuntimeKekConfig } from "../../runtimeEnvKek";

type KekRotationAuditDocument = {
    _id: string;
    activeKeyId: string;
    status: "running" | "completed" | "failed";
    startedAt: Date;
    completedAt: Date | null;
    inspected: number;
    rewrapped: number;
    failureCode?: "rotation-failed";
};

export async function createEnvelopeSecretCrypto(db: Db, config: RuntimeKekConfig): Promise<EnvelopeSecretCrypto> {
    const keys = Object.fromEntries(
        Object.entries(config.keysHex).map(([keyId, encoded]) => [keyId, Buffer.from(encoded, "hex")]),
    );
    const provider = new LocalKekRingProvider(config.activeKeyId, keys);
    const repository = new MongoDekRepository(db.collection("cms_deks"));
    if (config.rotateOnStart) {
        await rotateWithAudit(db, provider, repository);
    } else {
        await verifyDekKeyAvailability(provider, repository);
    }
    return new EnvelopeSecretCrypto(provider, repository);
}

async function rotateWithAudit(db: Db, provider: LocalKekRingProvider, repository: MongoDekRepository): Promise<void> {
    const audits = db.collection<KekRotationAuditDocument>("cms_kek_rotation_audits");
    await audits.createIndex({ startedAt: -1 }, { name: "startedAt" });
    const auditId = randomUUID();
    await audits.insertOne({
        _id: auditId,
        activeKeyId: provider.activeKeyId,
        status: "running",
        startedAt: new Date(),
        completedAt: null,
        inspected: 0,
        rewrapped: 0,
    });
    try {
        await verifyDekKeyAvailability(provider, repository);
        const report = await rotateDekWrapping(provider, repository);
        await verifyDekKeyAvailability(provider, repository);
        const finalized = await audits.updateOne(
            { _id: auditId, status: "running" },
            {
                $set: {
                    status: "completed",
                    completedAt: new Date(),
                    inspected: report.inspected,
                    rewrapped: report.rewrapped,
                },
            },
        );
        if (finalized.modifiedCount !== 1) {
            throw new Error("KEK rotation completed but its audit record could not be finalized.");
        }
    } catch (error) {
        await audits
            .updateOne(
                { _id: auditId, status: "running" },
                {
                    $set: {
                        status: "failed",
                        completedAt: new Date(),
                        failureCode: "rotation-failed",
                    },
                },
            )
            .catch(() => undefined);
        throw error;
    }
}
