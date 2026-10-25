import { RepositoryRequestError } from "../core/errors";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { canonicalIJsonBytes, parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type { NamespaceProof } from "./interfaces";

export function assertRepositoryNamespace(namespace: string): void {
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(namespace) || namespace.length > 96) {
        throw new RepositoryRequestError("REJECTED", "Invalid repository namespace");
    }
}

/** Canonical Ed25519 SPKI DER, encoded as unpadded base64url. Never accepts private keys. */
export function namespacePublicKey(encoded: string) {
    if (!/^[A-Za-z0-9_-]{59}$/u.test(encoded)) {
        throw new RepositoryRequestError("REJECTED", "Invalid namespace public key");
    }
    let key: ReturnType<typeof createPublicKey>;
    try {
        key = createPublicKey({ key: Buffer.from(encoded, "base64url"), format: "der", type: "spki" });
    } catch {
        throw new RepositoryRequestError("REJECTED", "Invalid namespace public key");
    }
    if (
        key.asymmetricKeyType !== "ed25519" ||
        key.export({ format: "der", type: "spki" }).toString("base64url") !== encoded
    ) {
        throw new RepositoryRequestError("REJECTED", "Namespace keys must use canonical Ed25519 SPKI");
    }
    return key;
}

export function repositoryDigest(value: unknown): string {
    return `sha256:${createHash("sha256").update(canonicalIJsonBytes(value)).digest("hex")}`;
}

export function signNamespaceProof(
    value: Omit<NamespaceProof, "signature" | "protocol">,
    privateKey: string,
): NamespaceProof {
    const payload = { protocol: "ulvia-repository-owner/v1" as const, ...value };
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ed25519") {
        throw new RepositoryRequestError("REJECTED", "Namespace keys must use Ed25519");
    }
    return { ...payload, signature: sign(null, canonicalIJsonBytes(payload), key).toString("base64url") };
}

export function parseNamespaceProof(value: unknown): NamespaceProof {
    const snapshot = parseStrictJson(canonicalIJsonBytes(value), 4_096, 4) as NamespaceProof;
    const fields = [
        "protocol",
        "repositoryId",
        "namespace",
        "revision",
        "action",
        "subject",
        "digest",
        "timestamp",
        "nonce",
        "signature",
    ];
    if (
        !snapshot ||
        typeof snapshot !== "object" ||
        Array.isArray(snapshot) ||
        Object.keys(snapshot).length !== fields.length ||
        Object.keys(snapshot).some((key) => !fields.includes(key)) ||
        snapshot.protocol !== "ulvia-repository-owner/v1" ||
        typeof snapshot.repositoryId !== "string" ||
        snapshot.repositoryId.length > 128 ||
        typeof snapshot.namespace !== "string" ||
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < 0 ||
        typeof snapshot.action !== "string" ||
        snapshot.action.length > 64 ||
        typeof snapshot.subject !== "string" ||
        snapshot.subject.length > 1_024 ||
        typeof snapshot.digest !== "string" ||
        !/^sha256:[0-9a-f]{64}$/u.test(snapshot.digest) ||
        !Number.isSafeInteger(snapshot.timestamp) ||
        typeof snapshot.nonce !== "string" ||
        !/^[0-9a-f-]{36}$/u.test(snapshot.nonce) ||
        typeof snapshot.signature !== "string" ||
        !/^[A-Za-z0-9_-]{86}$/u.test(snapshot.signature)
    ) {
        throw new RepositoryRequestError("REJECTED", "Invalid namespace ownership proof");
    }
    assertRepositoryNamespace(snapshot.namespace);
    signatureBytes(snapshot.signature);
    return Object.freeze(snapshot);
}

export function verifyNamespaceProof(proof: NamespaceProof, publicKey: string, now = Date.now()): void {
    const { signature, ...payload } = proof;
    const bytes = signatureBytes(signature);
    if (
        Math.abs(now - proof.timestamp) > 5 * 60_000 ||
        !verify(null, canonicalIJsonBytes(payload), namespacePublicKey(publicKey), bytes)
    ) {
        throw new RepositoryRequestError("REJECTED", "Namespace ownership proof is invalid or expired");
    }
}

function signatureBytes(signature: string): Buffer {
    if (typeof signature !== "string" || !/^[A-Za-z0-9_-]{86}$/u.test(signature)) {
        throw new RepositoryRequestError("REJECTED", "Invalid namespace signature encoding");
    }
    const bytes = Buffer.from(signature, "base64url");
    if (bytes.length !== 64 || bytes.toString("base64url") !== signature) {
        throw new RepositoryRequestError("REJECTED", "Invalid namespace signature encoding");
    }
    return bytes;
}
