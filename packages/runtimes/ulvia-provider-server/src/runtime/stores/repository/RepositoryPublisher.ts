import { PublisherConnection } from "./connection";
import { namespaceInventory, validateNamespaceQuery } from "./NamespaceInventory";
import { RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import type { RepositoryNamespaceCredential } from "@bernouy/cms-repository/repository/namespaces";
import type { CollectionPublisher, NamespaceInventoryQuery } from "@bernouy/cms-repository/repository/authoring";
import type { SecretStore } from "@bernouy/secret-store";

export class RepositoryPublisher implements CollectionPublisher {
    private readonly connection: PublisherConnection;
    constructor(
        readonly repositoryUrl: string,
        readonly repositorySourceId: string,
        secrets: SecretStore,
        readonly allowInsecureHttp = false,
    ) {
        this.connection = new PublisherConnection(secrets, repositoryUrl, allowInsecureHttp);
    }
    connectionStatus() {
        return this.connection.view();
    }
    configureConnection(token: string) {
        return this.connection.configure(token);
    }
    disconnectConnection() {
        return this.connection.disconnect();
    }
    async claim(namespace: string) {
        return (await this.client()).claim(namespace);
    }
    async credential(namespace: string): Promise<RepositoryNamespaceCredential> {
        return (await this.client()).ownedCredential(namespace);
    }
    async listNamespaces(input: NamespaceInventoryQuery = {}) {
        validateNamespaceQuery(input);
        const credential = await this.connection.credential();
        const entries = await new RepositoryNamespaceClient(this.repositoryUrl, {
            allowInsecureHttp: this.allowInsecureHttp,
            credential,
        }).list();
        return namespaceInventory(credential.repositoryId, entries, input);
    }
    private async client() {
        return new RepositoryNamespaceClient(this.repositoryUrl, {
            allowInsecureHttp: this.allowInsecureHttp,
            credential: await this.connection.credential(),
        });
    }
}
