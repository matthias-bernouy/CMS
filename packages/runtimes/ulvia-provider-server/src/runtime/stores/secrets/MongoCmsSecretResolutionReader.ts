import { asBuffer, type SecretCrypto } from "@bernouy/envelope-crypto";
import type { CmsSecretResolutionReader, CmsSecretMetadata, SecretNamespaceKeyRecord } from "@bernouy/cms-secrets";
import type { EncryptedSecretDocument } from "@bernouy/secret-store/mongo";
import type { Collection, Db } from "mongodb";

type Document<T extends { id: string }> = Omit<T, "id"> & { _id: string };
type ResolutionDocument = Document<SecretNamespaceKeyRecord> & {
    metadata: Document<CmsSecretMetadata>[];
    values: EncryptedSecretDocument[];
};

/** Instance-bound persistence composition; no plaintext or authority is cached. */
export class MongoCmsSecretResolutionReader implements CmsSecretResolutionReader {
    readonly #keys: Collection;

    constructor(
        db: Db,
        private readonly scopeId: string,
        private readonly crypto: SecretCrypto,
    ) {
        this.#keys = db.collection("cms_secret_namespace_keys");
    }

    async read(input: Parameters<CmsSecretResolutionReader["read"]>[0]) {
        const { namespaceId, keyId, name } = input;
        const rows = await this.#keys
            .aggregate<ResolutionDocument>([
                { $match: { _id: keyId } },
                {
                    $lookup: {
                        from: "cms_secret_metadata",
                        let: {
                            readable: {
                                $and: [
                                    { $eq: ["$namespaceId", { $literal: namespaceId }] },
                                    { $eq: ["$verifier", { $literal: input.verifier }] },
                                    { $eq: [{ $ifNull: ["$revokedAt", null] }, null] },
                                    {
                                        $or: [
                                            { $eq: [{ $ifNull: ["$expiresAt", null] }, null] },
                                            { $gt: ["$expiresAt", { $literal: input.checkedAt }] },
                                        ],
                                    },
                                    { $setIsSubset: [{ $literal: input.permissions }, "$permissions"] },
                                ],
                            },
                        },
                        pipeline: [
                            { $match: { namespaceId, name, $expr: { $eq: ["$$readable", true] } } },
                            { $limit: 2 },
                        ],
                        as: "metadata",
                    },
                },
                {
                    $lookup: {
                        from: "cms_secrets",
                        localField: "metadata.storageKey",
                        foreignField: "_id",
                        as: "values",
                    },
                },
                { $limit: 2 },
            ])
            .toArray();
        const row = rows[0];
        if (!row) {
            return { key: null, metadata: null, resolveValue: async () => null };
        }
        if (rows.length !== 1 || row._id !== keyId || row.metadata.length > 1 || row.values.length > 1) {
            throw new Error("Stored secret resolution is inconsistent");
        }
        const metadata = row.metadata[0];
        const value = row.values[0];
        if (value && (!metadata || value._id !== metadata.storageKey)) {
            throw new Error("Stored secret resolution is inconsistent");
        }
        const blob = value
            ? {
                  ciphertext: Buffer.from(asBuffer(value.ciphertext)),
                  iv: Buffer.from(asBuffer(value.iv)),
              }
            : null;
        const { _id, metadata: _metadata, values: _values, ...key } = row;
        const secret = metadata ? { ...metadata, id: metadata._id } : null;
        return {
            key: { ...key, id: _id },
            metadata: secret,
            resolveValue: () => (blob ? this.crypto.decrypt(this.scopeId, blob) : Promise.resolve(null)),
        };
    }
}
