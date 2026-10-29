import { providerInvocationKeyId } from "@bernouy/cms-gateway/protocol";
import type { SecretCrypto } from "@bernouy/envelope-crypto";
import type { Db } from "mongodb";
import { hashInstanceAccessToken } from "../../../src/runtime/authentication/ProviderInstanceAuthenticator";
import { MongoInstanceAuthenticationReader } from "../../../src/runtime/authentication/material/MongoInstanceAuthenticationReader";
import type { AuthenticationDocument } from "../../../src/runtime/authentication/material/authenticationPipeline";

export const TOKEN = "T".repeat(43);
export const INVOCATION_SECRET = "I".repeat(43);
export const INSTANCE_ID = "instance:alpha";
export const runtimeSecrets = {
    instanceAccessToken: TOKEN,
    invocationSecret: INVOCATION_SECRET,
    sessionSecret: "s".repeat(64),
    kekHex: "0".repeat(64),
};

export function authenticationDocument(): AuthenticationDocument {
    const time = new Date(0);
    return {
        instanceId: INSTANCE_ID,
        invocationKeyId: providerInvocationKeyId(INVOCATION_SECRET),
        accessTokenHash: hashInstanceAccessToken(TOKEN),
        secretKey: "ULVIA_INSTANCE_ALPHA",
        enabled: true,
        revision: 1,
        createdAt: time,
        updatedAt: time,
        secret: { _id: "ULVIA_INSTANCE_ALPHA", ciphertext: Buffer.from("ciphertext"), iv: Buffer.alloc(12) },
        instance: {
            id: INSTANCE_ID,
            idempotencyKey: "create-alpha",
            idempotencyFingerprint: "fingerprint",
            storageKey: "alpha",
            cmsUrl: "http://127.0.0.1:5100",
            label: "Alpha",
            status: "ready",
            profile: { id: "ulvia.official", version: "1.0.0" },
            revision: 1,
            createdAt: time,
            updatedAt: time,
        },
    };
}

export function materialFixture() {
    let document: AuthenticationDocument | null = authenticationDocument();
    let reads = 0;
    let decrypts = 0;
    let error: Error | undefined;
    let decrypt: SecretCrypto["decrypt"] = async () => JSON.stringify(runtimeSecrets);
    const db = {
        collection: (name: string) => {
            if (name !== "ulvia_provider_instance_credentials") {
                throw new Error("Unexpected authentication collection");
            }
            return {
                aggregate: (pipeline: { $match?: Record<string, unknown> }[]) => ({
                    toArray: async () => {
                        reads++;
                        if (error) {
                            throw error;
                        }
                        const match = pipeline[0].$match;
                        const row = document;
                        if (
                            !row ||
                            !match ||
                            !row.enabled ||
                            row.instance.status !== "ready" ||
                            Object.entries(match).some(([key, value]) => row[key as keyof typeof row] !== value)
                        ) {
                            return [];
                        }
                        return [
                            {
                                ...row,
                                instance: { ...row.instance },
                                secret: {
                                    ...row.secret,
                                    ciphertext: Buffer.from(row.secret.ciphertext),
                                    iv: Buffer.from(row.secret.iv),
                                },
                            },
                        ];
                    },
                }),
            };
        },
    } as unknown as Db;
    const crypto: SecretCrypto = {
        encrypt: async () => {
            throw new Error("Authentication cannot encrypt");
        },
        decrypt: async (scope, blob) => {
            decrypts++;
            return decrypt(scope, blob);
        },
    };
    return {
        reader: new MongoInstanceAuthenticationReader(db, "provider-control", crypto),
        db,
        crypto,
        get document() {
            return document;
        },
        set document(value) {
            document = value;
        },
        get reads() {
            return reads;
        },
        get decrypts() {
            return decrypts;
        },
        set decrypt(value: SecretCrypto["decrypt"]) {
            decrypt = value;
        },
        set error(value: Error | undefined) {
            error = value;
        },
    };
}
