import type { NamespaceAccess, NamespaceInventoryQuery, NamespaceInventoryPage } from "./namespaces";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { RemoteRepositoryClient } from "cms-repository/exports/repository/publication";
import { RepositorySourceClient } from "../sources/client";
import { prepareCollectionRelease } from "cms-repository/exports/collections/build";
import { prepareRemoteCollection, type AuthoringHost } from "./prepare";
import type { RepositoryOwnerCredential } from "cms-repository/exports/repository/namespaces";

export interface CollectionPublisher {
    readonly repositoryUrl: string;
    readonly repositorySourceId: string;
    readonly allowInsecureHttp?: boolean;
    credential(namespace: string): Promise<RepositoryOwnerCredential>;
    identity(): Promise<{ publicKey: string }>;
    listNamespaces(input?: NamespaceInventoryQuery): Promise<NamespaceInventoryPage>;
    trackNamespace(namespace: string): Promise<NamespaceAccess>;
    claim(namespace: string): Promise<unknown>;
}

export class CollectionAuthoring {
    constructor(
        private readonly host: AuthoringHost,
        private readonly publisher: CollectionPublisher,
    ) {}
    identity() {
        return this.publisher.identity();
    }
    claim(namespace: string) {
        return this.publisher.claim(namespace);
    }
    listNamespaces(input: NamespaceInventoryQuery = {}) {
        return this.publisher.listNamespaces(input);
    }
    trackNamespace(namespace: string) {
        return this.publisher.trackNamespace(namespace);
    }
    async prepare(sourceJson: string) {
        try {
            return {
                ...(await prepareRemoteCollection(this.host, sourceJson)),
                repositoryId: this.publisher.repositorySourceId,
            };
        } catch (error) {
            if (
                ["EACCES", "EPERM", "ENOSPC", "EROFS", "EMFILE", "ENFILE"].includes(
                    (error as NodeJS.ErrnoException).code ?? "",
                )
            ) {
                throw error;
            }
            const message = (error instanceof Error ? error.message : "Invalid collection sources")
                .replaceAll(this.host.root, "<sources>")
                .slice(0, 2048);
            throw new CollectionPreparationError(message);
        }
    }
    async publish(id: string, expectedDigest: string) {
        const path = this.path(id);
        const prepared = JSON.parse(await readFile(join(path, "prepared.json"), "utf8")) as {
            digest: string;
            sourceJson: string;
            directory: string;
            canonicalJson: string;
        };
        if (!/^[a-z][a-z0-9-]{0,95}$/u.test(prepared.directory)) {
            throw new Error("Invalid prepared collection");
        }
        const artifact = await prepareCollectionRelease(join(path, prepared.directory), this.host.contracts);
        if (
            artifact.digest !== expectedDigest ||
            artifact.digest !== prepared.digest ||
            artifact.canonicalJson !== prepared.canonicalJson
        ) {
            throw new Error("Prepared collection digest changed");
        }
        const credential = await this.publisher.credential(artifact.release.publisherId);
        const published = await new RemoteRepositoryClient(
            this.publisher.repositoryUrl,
            credential,
            this.publisher,
        ).push({
            kind: "collection",
            canonicalJson: artifact.canonicalJson,
            assets: artifact.assets,
        });
        if (published.digest !== artifact.digest) {
            throw new Error("Repository publication digest mismatch");
        }
        await new RepositorySourceClient(this.publisher.repositoryUrl, credential, this.publisher).put(
            artifact.release.collectionId,
            artifact.release.version,
            {
                sourceJson: prepared.sourceJson,
                releaseDigest: artifact.digest,
            },
        );
        return {
            ...published,
            kind: "collection" as const,
            repositoryId: this.publisher.repositorySourceId,
            publisherId: artifact.release.publisherId,
            collectionId: artifact.release.collectionId,
            version: artifact.release.version,
        };
    }
    async sources(namespace: string, collectionId: string, version: string) {
        return new RepositorySourceClient(
            this.publisher.repositoryUrl,
            await this.publisher.credential(namespace),
            this.publisher,
        ).get(collectionId, version);
    }
    async discard(id: string) {
        await rm(this.path(id), { recursive: true, force: true });
        return { discarded: true };
    }
    private path(id: string) {
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id)) {
            throw new Error("Invalid preparation ID");
        }
        return join(this.host.root, id);
    }
}

export class CollectionPreparationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CollectionPreparationError";
    }
}
