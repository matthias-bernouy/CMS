import { asBuffer, type EncryptedBlob, type SecretCrypto } from "@bernouy/envelope-crypto";
import type { Db, Collection } from "mongodb";
import { serializeProviderInstance } from "../../instances/MongoProviderInstanceRegistry";
import { DecryptedAuthenticationCache } from "./DecryptedAuthenticationCache";
import { authenticationPipeline, type AuthenticationDocument } from "./authenticationPipeline";
import { parseInstanceRuntimeCredentials } from "./parseInstanceRuntimeCredentials";
import type {
    AuthenticationSelector,
    InstanceAuthenticationMaterial,
    InstanceAuthenticationReader,
} from "./InstanceAuthenticationReader";

/** Joins fresh authority and ciphertext; only unchanged decrypted authentication keys are reused. */
export class MongoInstanceAuthenticationReader implements InstanceAuthenticationReader {
    readonly #credentials: Collection;
    readonly #cache = new DecryptedAuthenticationCache();

    constructor(
        db: Db,
        private readonly scopeId: string,
        private readonly crypto: SecretCrypto,
    ) {
        this.#credentials = db.collection("ulvia_provider_instance_credentials");
    }

    async read(selector: AuthenticationSelector): Promise<InstanceAuthenticationMaterial | null> {
        let current = await this.capture(selector);
        for (let attempt = 0; current && attempt < 2; attempt++) {
            const blob = this.blob(current);
            const cached = this.#cache.get(current.secretKey, blob);
            if (cached) {
                return this.material(current, cached);
            }
            // Do not cache session secrets or the instance KEK in this authentication reader.
            const parsed = parseInstanceRuntimeCredentials(await this.crypto.decrypt(this.scopeId, blob));
            const secrets = Object.freeze({
                instanceAccessToken: parsed.instanceAccessToken,
                invocationSecret: parsed.invocationSecret,
            });
            // An asynchronous decrypt must not hide a revocation or rotation during loading.
            const latest = await this.capture(selector);
            if (!latest) {
                this.#cache.delete(current.secretKey);
                return null;
            }
            if (this.sameCredential(current, latest) && this.sameBlob(blob, this.blob(latest))) {
                this.#cache.remember(latest.secretKey, blob, secrets);
                return this.material(latest, secrets);
            }
            this.#cache.delete(current.secretKey);
            current = latest;
        }
        if (current) {
            throw new Error("Provider authentication material changed during loading");
        }
        return null;
    }

    private async capture(selector: AuthenticationSelector): Promise<AuthenticationDocument | null> {
        const rows = await this.#credentials
            .aggregate<AuthenticationDocument>(authenticationPipeline(selector))
            .toArray();
        const row = rows[0];
        if (!row) {
            return null;
        }
        if (
            rows.length !== 1 ||
            row[selector.field] !== selector.value ||
            !row.enabled ||
            row.instance.id !== row.instanceId ||
            row.instance.status !== "ready" ||
            row.secret._id !== row.secretKey
        ) {
            throw new Error("Stored Provider authentication material is inconsistent");
        }
        return row;
    }

    private blob(row: AuthenticationDocument): EncryptedBlob {
        return {
            ciphertext: Buffer.from(asBuffer(row.secret.ciphertext)),
            iv: Buffer.from(asBuffer(row.secret.iv)),
        };
    }

    private sameBlob(left: EncryptedBlob, right: EncryptedBlob): boolean {
        return left.ciphertext.equals(right.ciphertext) && left.iv.equals(right.iv);
    }

    private sameCredential(left: AuthenticationDocument, right: AuthenticationDocument): boolean {
        return (
            left.instanceId === right.instanceId &&
            left.secretKey === right.secretKey &&
            left.invocationKeyId === right.invocationKeyId &&
            left.accessTokenHash === right.accessTokenHash &&
            left.revision === right.revision
        );
    }

    private material(
        row: AuthenticationDocument,
        secrets: InstanceAuthenticationMaterial["secrets"],
    ): InstanceAuthenticationMaterial {
        return {
            instance: serializeProviderInstance(row.instance),
            secrets,
        };
    }
}
