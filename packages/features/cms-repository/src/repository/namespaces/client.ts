import { randomUUID } from "node:crypto";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { boundedResponseBytes, repositoryUrl } from "../publication/transport";
import type { RepositoryNamespace } from "./interfaces";
import { assertRepositoryNamespace, repositoryDigest, signNamespaceProof } from "./proofs";
import type { RepositoryOwnerCredential } from "./request";

export class RepositoryNamespaceClient {
    private readonly base: URL;
    constructor(url: string) {
        this.base = repositoryUrl(url);
    }

    async identity(): Promise<string> {
        const value = (await this.request("v1/repository")) as { repositoryId?: unknown };
        if (typeof value.repositoryId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.repositoryId)) {
            throw new Error("Repository returned an invalid identity");
        }
        return value.repositoryId;
    }

    async get(namespace: string): Promise<RepositoryNamespace | null> {
        assertRepositoryNamespace(namespace);
        return (await this.request(`v1/namespaces/${namespace}`, undefined, true)) as RepositoryNamespace | null;
    }

    async claim(credential: RepositoryOwnerCredential, publicKey: string): Promise<RepositoryNamespace> {
        return (await this.request(`v1/namespaces/${credential.namespace}`, {
            action: "claim",
            publicKey,
            proof: await this.proof(credential, "claim", repositoryDigest({ publicKey })),
        })) as RepositoryNamespace;
    }

    async rotate(
        credential: RepositoryOwnerCredential,
        replacement: { publicKey: string; resolvePrivateKey(): Promise<string> },
    ): Promise<RepositoryNamespace> {
        const digest = repositoryDigest({ publicKey: replacement.publicKey });
        return (await this.request(`v1/namespaces/${credential.namespace}`, {
            action: "rotate",
            publicKey: replacement.publicKey,
            proof: await this.proof(credential, "rotate", digest),
            replacementProof: await this.proof(
                { ...credential, resolvePrivateKey: replacement.resolvePrivateKey },
                "accept-key",
                digest,
            ),
        })) as RepositoryNamespace;
    }

    async revoke(credential: RepositoryOwnerCredential): Promise<RepositoryNamespace> {
        return (await this.request(`v1/namespaces/${credential.namespace}`, {
            action: "revoke",
            proof: await this.proof(credential, "revoke", repositoryDigest(null)),
        })) as RepositoryNamespace;
    }

    private async proof(credential: RepositoryOwnerCredential, action: string, digest: string) {
        assertRepositoryNamespace(credential.namespace);
        return signNamespaceProof(
            {
                repositoryId: credential.repositoryId,
                namespace: credential.namespace,
                revision: credential.revision,
                action,
                subject: credential.namespace,
                digest,
                timestamp: Date.now(),
                nonce: randomUUID(),
            },
            await credential.resolvePrivateKey(),
        );
    }

    private async request(path: string, value?: unknown, missing = false): Promise<unknown> {
        const response = await fetch(new URL(path, this.base), {
            method: value === undefined ? "GET" : "POST",
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
            headers: {
                Accept: "application/json",
                ...(value === undefined ? {} : { "Content-Type": "application/json" }),
            },
            ...(value === undefined ? {} : { body: JSON.stringify(value) }),
        });
        if (missing && response.status === 404) {
            await response.body?.cancel();
            return null;
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Repository namespace request rejected (${response.status})`);
        }
        return parseStrictJson(await boundedResponseBytes(response, 16_384), 16_384, 8);
    }
}
