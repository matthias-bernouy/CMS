import { repositoryUrl } from "../publication/transport";
import { randomUUID } from "node:crypto";
import { canonicalIJsonBytes, parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { signNamespaceProof, repositoryDigest } from "../namespaces/proofs";
import type { RepositoryOwnerCredential } from "../namespaces/request";
import type { RepositorySourceSnapshot } from "./interfaces";

export class RepositorySourceClient {
    private readonly baseUrl: URL;
    constructor(
        baseUrl: string,
        private readonly credential: RepositoryOwnerCredential,
        options: Readonly<{ allowInsecureHttp?: boolean }> = {},
    ) {
        this.baseUrl = repositoryUrl(baseUrl, options);
    }
    get(collectionId: string, version: string): Promise<RepositorySourceSnapshot | null> {
        return this.request("source-get", { collectionId, version });
    }
    put(collectionId: string, version: string, snapshot: RepositorySourceSnapshot) {
        return this.request("source-put", { collectionId, version, ...snapshot });
    }
    private async request(action: "source-get" | "source-put", input: Record<string, unknown>) {
        const proof = signNamespaceProof(
            {
                repositoryId: this.credential.repositoryId,
                namespace: this.credential.namespace,
                revision: this.credential.revision,
                action,
                subject: `${input.collectionId}@${input.version}`,
                digest: repositoryDigest(input),
                timestamp: Date.now(),
                nonce: randomUUID(),
            },
            await this.credential.resolvePrivateKey(),
        );
        const response = await fetch(
            new URL(action === "source-get" ? "v1/source-snapshots" : "v1/source-snapshots/put", this.baseUrl),
            {
                method: action === "source-get" ? "QUERY" : "POST",
                redirect: "error",
                signal: AbortSignal.timeout(30_000),
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: new Uint8Array(
                    canonicalIJsonBytes({
                        namespace: this.credential.namespace,
                        ...input,
                        proof: JSON.stringify(proof),
                    }),
                ),
            },
        );
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Repository source request rejected (${response.status})`);
        }
        if (!response.body) {
            throw new Error("Repository source response is empty");
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done) {
                    break;
                }
                size += part.value.byteLength;
                if (size > 4 * 1024 * 1024) {
                    await reader.cancel();
                    throw new Error("Repository source response is too large");
                }
                chunks.push(part.value);
            }
        } finally {
            reader.releaseLock();
        }
        return parseStrictJson(
            Buffer.concat(chunks),
            4 * 1024 * 1024,
            32,
        ) as unknown as RepositorySourceSnapshot | null;
    }
}
