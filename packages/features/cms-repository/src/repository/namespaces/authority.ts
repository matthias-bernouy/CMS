import { RepositoryRequestError } from "../core/errors";
import type { NamespaceProof, RepositoryNamespace, RepositoryNamespaceStore } from "./interfaces";
import { namespaceState as state } from "./state";
import {
    assertRepositoryNamespace,
    namespacePublicKey,
    parseNamespaceProof,
    repositoryDigest,
    verifyNamespaceProof,
} from "./proofs";

export class RepositoryNamespaceAuthority {
    constructor(
        readonly repositoryId: string,
        private readonly store: RepositoryNamespaceStore,
        private readonly reserved: (namespace: string) => Promise<boolean> = async () => false,
    ) {
        if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(repositoryId)) {
            throw new RepositoryRequestError("REJECTED", "Invalid repository identity");
        }
    }

    get(namespace: string, revision?: number): Promise<RepositoryNamespace | null> {
        assertRepositoryNamespace(namespace);
        if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) {
            throw new RepositoryRequestError("REJECTED", "Invalid namespace revision");
        }
        return this.store.get(namespace, revision);
    }

    async assertOperatorNamespace(namespace: string): Promise<void> {
        assertRepositoryNamespace(namespace);
        if ((await this.store.get(namespace)) || !(await this.reserved(namespace))) {
            throw new RepositoryRequestError("REJECTED", "Operator credentials cannot write a community namespace");
        }
    }

    async claim(namespace: string, publicKey: string, supplied: unknown): Promise<RepositoryNamespace> {
        assertRepositoryNamespace(namespace);
        namespacePublicKey(publicKey);
        const proof = this.proof(supplied, namespace, "claim", namespace, repositoryDigest({ publicKey }));
        verifyNamespaceProof(proof, publicKey);
        if (proof.revision !== 0) {
            throw new RepositoryRequestError("REJECTED", "Namespace claims require revision zero");
        }
        return this.store.exclusive(namespace, async (current, save) => {
            if (current?.revision === 1 && current.publicKey === publicKey && !current.revoked) {
                return current;
            }
            if (current || proof.revision !== 0 || (await this.reserved(namespace))) {
                throw new RepositoryRequestError("REJECTED", "Repository namespace is already owned or reserved");
            }
            const next = state(namespace, 1, publicKey, "claim", null);
            await save(next);
            return next;
        });
    }

    async rotate(
        namespace: string,
        publicKey: string,
        supplied: unknown,
        replacement: unknown,
    ): Promise<RepositoryNamespace> {
        namespacePublicKey(publicKey);
        const digest = repositoryDigest({ publicKey });
        const proof = this.proof(supplied, namespace, "rotate", namespace, digest);
        const possession = this.proof(replacement, namespace, "accept-key", namespace, digest);
        if (proof.revision !== possession.revision) {
            throw new RepositoryRequestError("REJECTED", "Replacement key proof has a different namespace revision");
        }
        verifyNamespaceProof(possession, publicKey);
        return this.transition(proof, "rotate", publicKey, async (current, save) => {
            if (publicKey === current.publicKey) {
                throw new RepositoryRequestError("REJECTED", "Replacement key must differ from the current key");
            }
            const next = state(
                namespace,
                current.revision + 1,
                publicKey,
                "rotate",
                repositoryDigest(current),
                proof.timestamp,
            );
            await save(next);
            return next;
        });
    }

    async revoke(namespace: string, supplied: unknown): Promise<RepositoryNamespace> {
        const proof = this.proof(supplied, namespace, "revoke", namespace, repositoryDigest(null));
        return this.transition(proof, "revoke", undefined, async (current, save) => {
            const next = state(
                namespace,
                current.revision + 1,
                current.publicKey,
                "revoke",
                repositoryDigest(current),
                proof.timestamp,
            );
            await save(next);
            return next;
        });
    }

    /** Proofs grant one exact action, never general operator authority. Caller handles request replay claims. */
    async execute<T>(
        namespace: string,
        action: string,
        subject: string,
        digest: string,
        supplied: unknown,
        operation: () => Promise<T>,
    ): Promise<T> {
        const proof = this.proof(supplied, namespace, action, subject, digest);
        return this.authorized(proof, operation);
    }

    private proof(value: unknown, namespace: string, action: string, subject: string, digest: string): NamespaceProof {
        const proof = parseNamespaceProof(value);
        if (
            proof.repositoryId !== this.repositoryId ||
            proof.namespace !== namespace ||
            proof.action !== action ||
            proof.subject !== subject ||
            proof.digest !== digest
        ) {
            throw new RepositoryRequestError("REJECTED", "Namespace proof does not authorize this operation");
        }
        return proof;
    }

    private async authorized<T>(
        proof: NamespaceProof,
        operation: (current: RepositoryNamespace, save: (next: RepositoryNamespace) => Promise<void>) => Promise<T>,
    ): Promise<T> {
        const candidate = await this.store.get(proof.namespace);
        if (!candidate || candidate.revoked || candidate.revision !== proof.revision) {
            throw new RepositoryRequestError("REJECTED", "Namespace ownership is unavailable or stale");
        }
        verifyNamespaceProof(proof, candidate.publicKey);
        return this.store.exclusive(proof.namespace, async (current, save) => {
            if (!current || current.revoked || current.revision !== proof.revision) {
                throw new RepositoryRequestError("REJECTED", "Namespace ownership is unavailable or stale");
            }
            verifyNamespaceProof(proof, current.publicKey);
            return operation(current, save);
        });
    }

    private transition(
        proof: NamespaceProof,
        action: "rotate" | "revoke",
        replacement: string | undefined,
        operation: (
            current: RepositoryNamespace,
            save: (next: RepositoryNamespace) => Promise<void>,
        ) => Promise<RepositoryNamespace>,
    ): Promise<RepositoryNamespace> {
        return this.store.exclusive(proof.namespace, async (current, save) => {
            if (
                current?.revision === proof.revision + 1 &&
                current.action === action &&
                current.updatedAt === new Date(proof.timestamp).toISOString() &&
                (!replacement || current.publicKey === replacement)
            ) {
                const previous = await this.store.get(proof.namespace, proof.revision);
                if (previous && current.previousDigest === repositoryDigest(previous)) {
                    verifyNamespaceProof(proof, previous.publicKey);
                    return current;
                }
            }
            if (!current || current.revoked || current.revision !== proof.revision) {
                throw new RepositoryRequestError("REJECTED", "Namespace ownership is unavailable or stale");
            }
            verifyNamespaceProof(proof, current.publicKey);
            return operation(current, save);
        });
    }
}
