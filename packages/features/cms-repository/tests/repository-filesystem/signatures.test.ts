import { expect, test } from "bun:test";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import {
    parseNamespaceProof,
    verifyNamespaceProof,
    signNamespaceProof,
    repositoryDigest,
} from "@bernouy/cms-repository/repository/namespaces";

test("both ownership boundaries reject all equivalent noncanonical Ed25519 encodings", () => {
    const keys = generateKeyPairSync("ed25519");
    const publicKey = keys.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
    const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const proof = signNamespaceProof(
        {
            repositoryId: "test",
            namespace: "community",
            revision: 1,
            action: "publish",
            subject: "community",
            digest: repositoryDigest(null),
            timestamp: Date.now(),
            nonce: randomUUID(),
        },
        privateKey,
    );
    expect(parseNamespaceProof(proof)).toEqual(proof);
    expect(() => verifyNamespaceProof(proof, publicKey)).not.toThrow();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const highBits = alphabet.indexOf(proof.signature.at(-1)!) & 48;
    for (let lowBits = 1; lowBits < 16; lowBits++) {
        const signature = proof.signature.slice(0, -1) + alphabet[highBits | lowBits];
        expect(Buffer.from(signature, "base64url")).toEqual(Buffer.from(proof.signature, "base64url"));
        const alias = { ...proof, signature };
        expect(() => parseNamespaceProof(alias)).toThrow("signature encoding");
        expect(() => verifyNamespaceProof(alias, publicKey)).toThrow("signature encoding");
    }
    for (const signature of [proof.signature + "==", proof.signature.slice(1), "+".repeat(86), "A".repeat(88)]) {
        expect(() => parseNamespaceProof({ ...proof, signature })).toThrow();
        expect(() => verifyNamespaceProof({ ...proof, signature }, publicKey)).toThrow();
    }
    expect(() => verifyNamespaceProof({ ...proof, subject: "foreign" }, publicKey)).toThrow();
    expect(() => verifyNamespaceProof(proof, publicKey, proof.timestamp + 300_001)).toThrow();
});
