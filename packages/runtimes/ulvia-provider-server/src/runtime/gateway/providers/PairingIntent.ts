import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { StoredProviderInstallation } from "@bernouy/cms-repository/providers/installations";
import { providerInstallationFingerprint } from "@bernouy/cms-gateway/access/providers";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { secretKeyToRef } from "@bernouy/secret-store";
import type { ProviderStores } from "../../stores/providerStores";

export type PairingInput = { installationId: string; expectedRevision: number; rotate?: boolean };
export type PairingIntent = {
    _id: string;
    hash: string;
    completed: boolean;
    expectedRevision: number;
    key: string;
    baseDigest: string;
    actorId: string;
    rotate: boolean;
};
export const installationDigest = providerInstallationFingerprint;
export const pairingConflict = () => Object.assign(new Error("Pairing revision conflict"), { status: 409 });

/** One durable operation per installation; observation-only changes do not cancel a retry. */
export async function preparePairing(
    stores: ProviderStores,
    source: StoredProviderInstallation,
    input: PairingInput,
    actorId: string,
    operationId?: string,
) {
    if (source.installation.status !== "enabled") {
        throw pairingConflict();
    }
    const documents = stores.db.collection<PairingIntent>("cms_provider_pairing_intents");
    const hash = createHash("sha256")
        .update(canonicalizeIJson({ operation: operationId ?? input, actorId }))
        .digest("hex");
    const receiptId = `${input.installationId}/${hash}`;
    const receipt = await documents.findOne({ _id: receiptId });
    if (receipt) {
        if (source.installation.gatewayTokenRef !== secretKeyToRef(receipt.key)) {
            throw pairingConflict();
        }
        return receipt;
    }
    let intent = await documents.findOne({ _id: input.installationId });
    if (intent && !intent.completed) {
        if (
            intent.hash === hash ||
            (intent.actorId === actorId &&
                intent.rotate === Boolean(input.rotate) &&
                intent.baseDigest === installationDigest(source))
        ) {
            return intent;
        }
        if (intent.baseDigest === installationDigest(source) || source.revision !== input.expectedRevision) {
            throw pairingConflict();
        }
    }
    if (intent?.hash === hash) {
        return intent;
    }
    if (source.revision !== input.expectedRevision) {
        throw pairingConflict();
    }
    const key = `ULVIA_PROVIDER_GATEWAY_${randomUUID().replaceAll("-", "").toUpperCase()}`;
    await stores.contractSecrets.installations.set(key, randomBytes(32).toString("hex"));
    const candidate: PairingIntent = {
        _id: input.installationId,
        hash,
        completed: false,
        expectedRevision: input.expectedRevision,
        key,
        baseDigest: installationDigest(source),
        actorId,
        rotate: Boolean(input.rotate),
    };
    try {
        if (intent) {
            const result = await documents.replaceOne(
                { _id: intent._id, hash: intent.hash, completed: intent.completed },
                candidate,
            );
            if (!result.matchedCount) {
                throw pairingConflict();
            }
        } else {
            await documents.insertOne(candidate);
        }
    } catch (error) {
        await stores.contractSecrets.installations.delete(key);
        throw error;
    }
    if (intent && !intent.completed && source.installation.gatewayTokenRef !== secretKeyToRef(intent.key)) {
        await stores.contractSecrets.installations.delete(intent.key);
    }
    return candidate;
}

export async function completePairing(stores: ProviderStores, installationId: string, credentialRef: string) {
    const documents = stores.db.collection<PairingIntent>("cms_provider_pairing_intents");
    const intent = await documents.findOne({ _id: installationId });
    if (!intent || secretKeyToRef(intent.key) !== credentialRef) {
        return;
    }
    await documents.updateOne(
        { _id: `${installationId}/${intent.hash}` },
        { $setOnInsert: { ...intent, _id: `${installationId}/${intent.hash}`, completed: true } },
        { upsert: true },
    );
    await documents.updateOne({ _id: installationId, hash: intent.hash }, { $set: { completed: true } });
}
