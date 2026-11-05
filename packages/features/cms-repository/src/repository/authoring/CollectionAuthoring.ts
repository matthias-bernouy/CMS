import type { NamespaceInventoryQuery, NamespaceInventoryPage } from "./namespaces";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { RepositorySourceClient } from "../sources/client";
import { CollectionAuthoringValidationError } from "cms-repository/exports/collections/build";
import { prepareRemoteCollection, type AuthoringHost } from "./preparations/prepare";
import { CollectionPreparationError } from "./preparations/errors";
import { collectionPreflight } from "./preflight";
import { publishPreparedCollection } from "./publication/publish";
import { RepositoryRequestError } from "../core/errors";
import { NamespaceAccessError } from "./namespaces";
export { CollectionPreparationError, CollectionPublicationRecoveryError } from "./preparations/errors";
import type { RepositoryNamespaceCredential } from "cms-repository/exports/repository/namespaces";

export interface RepositoryConnectionStatus {
    readonly configured: boolean;
    readonly repositoryUrl: string;
    readonly repositoryId: string | null;
}

export interface CollectionPublisher {
    readonly repositoryUrl: string;
    readonly repositorySourceId: string;
    readonly allowInsecureHttp?: boolean;
    credential(namespace: string): Promise<RepositoryNamespaceCredential>;
    connectionStatus(): Promise<RepositoryConnectionStatus>;
    configureConnection(token: string): Promise<RepositoryConnectionStatus>;
    disconnectConnection(): Promise<RepositoryConnectionStatus>;
    listNamespaces(input?: NamespaceInventoryQuery): Promise<NamespaceInventoryPage>;
    claim(namespace: string): Promise<unknown>;
}

export class CollectionAuthoring {
    constructor(
        protected readonly host: AuthoringHost,
        protected readonly publisher: CollectionPublisher,
    ) {}
    connectionStatus() {
        return this.publisher.connectionStatus();
    }
    configureConnection(token: string) {
        return this.publisher.configureConnection(token);
    }
    disconnectConnection() {
        return this.publisher.disconnectConnection();
    }
    claim(namespace: string) {
        return this.publisher.claim(namespace);
    }
    listNamespaces(input: NamespaceInventoryQuery = {}) {
        return this.publisher.listNamespaces(input);
    }
    async prepare(sourceJson: string) {
        try {
            return {
                ...(await prepareRemoteCollection(this.host, sourceJson, (artifact) =>
                    collectionPreflight(this.publisher, artifact),
                )),
                repositoryId: this.publisher.repositorySourceId,
            };
        } catch (error) {
            if (
                error instanceof CollectionPreparationError ||
                error instanceof NamespaceAccessError ||
                error instanceof RepositoryRequestError
            ) {
                throw error;
            }
            if (
                ["EACCES", "EPERM", "EIO", "ENOSPC", "EROFS", "EMFILE", "ENFILE"].includes(
                    (error as NodeJS.ErrnoException).code ?? "",
                )
            ) {
                throw error;
            }
            const message = (error instanceof Error ? error.message : "Invalid collection sources")
                .replaceAll(this.host.root, "<sources>")
                .slice(0, 2048);
            throw new CollectionPreparationError(
                message,
                error instanceof CollectionAuthoringValidationError ? error.diagnostics : undefined,
            );
        }
    }
    async publish(id: string, expectedDigest: string) {
        return publishPreparedCollection(this.host, this.publisher, id, expectedDigest);
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
