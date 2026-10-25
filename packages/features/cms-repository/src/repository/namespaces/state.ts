import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type { RepositoryNamespace } from "./interfaces";
import { assertRepositoryNamespace, namespacePublicKey } from "./proofs";

export function parseNamespaceState(bytes: Uint8Array | string, namespace: string): RepositoryNamespace {
    const value = parseStrictJson(bytes, 4_096, 4) as RepositoryNamespace;
    const fields = ["namespace", "revision", "publicKey", "revoked", "updatedAt", "action", "previousDigest"];
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length !== fields.length ||
        Object.keys(value).some((key) => !fields.includes(key)) ||
        value.namespace !== namespace ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 1 ||
        typeof value.publicKey !== "string" ||
        typeof value.revoked !== "boolean" ||
        typeof value.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.updatedAt)) ||
        !["claim", "rotate", "revoke"].includes(value.action) ||
        value.revoked !== (value.action === "revoke") ||
        (value.revision === 1
            ? value.action !== "claim" || value.previousDigest !== null
            : value.action === "claim" ||
              typeof value.previousDigest !== "string" ||
              !/^sha256:[0-9a-f]{64}$/u.test(value.previousDigest))
    ) {
        throw new Error("Invalid persisted namespace state");
    }
    assertRepositoryNamespace(value.namespace);
    namespacePublicKey(value.publicKey);
    return Object.freeze(value);
}

export function namespaceState(
    namespace: string,
    revision: number,
    publicKey: string,
    action: RepositoryNamespace["action"],
    previousDigest: string | null,
    timestamp = Date.now(),
): RepositoryNamespace {
    return Object.freeze({
        namespace,
        revision,
        publicKey,
        revoked: action === "revoke",
        updatedAt: new Date(timestamp).toISOString(),
        action,
        previousDigest,
    });
}
