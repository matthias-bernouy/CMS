import { randomUUID } from "node:crypto";
import { signNamespaceProof } from "./proofs";

/** CMS runtimes resolve the private key from their injected SecretReader; only public keys leave the host. */
export type RepositoryOwnerCredential = Readonly<{
    namespace: string;
    repositoryId: string;
    revision: number;
    resolvePrivateKey(): Promise<string>;
}>;

export async function repositoryWriteHeaders(
    method: string,
    url: URL,
    digest: string,
    credential?: RepositoryOwnerCredential,
): Promise<Record<string, string>> {
    if (!credential) {
        throw new Error("Repository writes require a namespace owner credential");
    }
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
