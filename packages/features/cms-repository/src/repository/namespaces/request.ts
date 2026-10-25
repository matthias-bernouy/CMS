import { randomUUID } from "node:crypto";
import { signRepositoryContentDigest } from "../publication/auth";
import { signNamespaceProof } from "./proofs";

/** CMS runtimes resolve the private key from their injected SecretReader; only public keys leave the host. */
export type RepositoryOwnerCredential = Readonly<{
    namespace: string;
    repositoryId: string;
    revision: number;
    resolvePrivateKey(): Promise<string>;
}>;

export type RepositoryWriteCredential = string | RepositoryOwnerCredential;

export async function repositoryWriteHeaders(
    method: string,
    url: URL,
    digest: string,
    credential?: RepositoryWriteCredential,
): Promise<Record<string, string>> {
    if (!credential) {
        throw new Error("Repository writes require an owner credential or ULVIA_REPOSITORY_TOKEN");
    }
    if (typeof credential !== "string") {
        const proof = signNamespaceProof(
            {
                repositoryId: credential.repositoryId,
                namespace: credential.namespace,
                revision: credential.revision,
                action: `http:${method}`,
                subject: `${url.pathname}${url.search}`,
                digest: `sha256:${digest}`,
                timestamp: Date.now(),
                nonce: randomUUID(),
            },
            await credential.resolvePrivateKey(),
        );
        return { "X-Ulvia-Owner-Proof": Buffer.from(JSON.stringify(proof)).toString("base64url") };
    }
    const signed = signRepositoryContentDigest(method, url, digest, credential);
    return {
        Authorization: signed.authorization,
        "X-Ulvia-Timestamp": signed.timestamp,
        "X-Ulvia-Nonce": signed.nonce,
        "X-Ulvia-Content-SHA256": signed.contentDigest,
        "X-Ulvia-Signature": signed.signature,
    };
}
