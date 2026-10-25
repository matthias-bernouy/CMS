import { loadPublicationIdentity } from "./publicationIdentity";
import { NamespaceInventory } from "./NamespaceInventory";
import { NamespaceAccessError, type NamespaceInventoryQuery } from "@bernouy/cms-repository/repository/authoring";
import {
    RepositoryNamespaceClient,
    type RepositoryOwnerCredential,
} from "@bernouy/cms-repository/repository/namespaces";
import type { CollectionPublisher } from "@bernouy/cms-repository/repository/authoring";
import type { SecretStore } from "@bernouy/secret-store";
import type { Db } from "mongodb";

/** The Repository signing key remains in this contract's encrypted secret namespace. */
export class RepositoryPublisher implements CollectionPublisher {
    private readonly inventory: NamespaceInventory;
    private identityPromise?: Promise<{ publicKey: string; key: string; repositoryId: string }>;
    constructor(
        readonly repositoryUrl: string,
        readonly repositorySourceId: string,
        private readonly secrets: SecretStore,
        private readonly db: Db,
        readonly allowInsecureHttp = false,
    ) {
        this.inventory = new NamespaceInventory(db);
    }
    async identity() {
        const identity = await this.loadIdentity();
        return { publicKey: identity.publicKey };
    }
    async claim(namespace: string) {
        const client = new RepositoryNamespaceClient(this.repositoryUrl, this);
        const identity = await this.loadIdentity();
        await this.inventory.remember(namespace, identity.repositoryId);
        return client.claim(
            {
                repositoryId: await this.assertRepository(identity.repositoryId),
                namespace,
                revision: 0,
                resolvePrivateKey: async () => identity.key,
            },
            identity.publicKey,
        );
    }
    async credential(namespace: string): Promise<RepositoryOwnerCredential> {
        const client = new RepositoryNamespaceClient(this.repositoryUrl, this);
        const [repositoryId, owner, identity] = await Promise.all([
            client.identity(),
            client.get(namespace),
            this.loadIdentity(),
        ]);
        if (repositoryId !== identity.repositoryId) {
            throw new Error("Repository identity changed");
        }
        if (!owner || owner.revoked || owner.publicKey !== identity.publicKey) {
            throw new NamespaceAccessError("This instance does not own the Repository namespace");
        }
        await this.inventory.remember(namespace, repositoryId);
        return { repositoryId, namespace, revision: owner.revision, resolvePrivateKey: async () => identity.key };
    }
    async trackNamespace(namespace: string) {
        await this.credential(namespace);
        const page = await this.listNamespaces({ namespace });
        return page.items[0]!;
    }
    async listNamespaces(input: NamespaceInventoryQuery = {}) {
        const identity = await this.loadIdentity();
        await this.assertRepository(identity.repositoryId);
        return this.inventory.list(
            identity.repositoryId,
            identity.publicKey,
            new RepositoryNamespaceClient(this.repositoryUrl, this),
            input,
        );
    }
    private loadIdentity() {
        this.identityPromise ??= this.createIdentity().catch((error) => {
            this.identityPromise = undefined;
            throw error;
        });
        return this.identityPromise;
    }
    private async assertRepository(expected: string) {
        const observed = await new RepositoryNamespaceClient(this.repositoryUrl, this).identity();
        if (observed !== expected) {
            throw new Error("Repository identity changed");
        }
        return observed;
    }
    private async createIdentity() {
        const repositoryId = await new RepositoryNamespaceClient(this.repositoryUrl, this).identity();
        return loadPublicationIdentity(this.repositoryUrl, repositoryId, this.secrets, this.db);
    }
}
