import { RepositoryConnection } from "../publication/transport/connection";
import type { RepositoryNamespaceCredential } from "../publication/transport/credentials";
import type { ArtifactSourceKind, RepositorySourceSnapshot } from "./interfaces";

export class RepositorySourceClient {
    private readonly connection: RepositoryConnection;
    constructor(
        baseUrl: string,
        private readonly credential: RepositoryNamespaceCredential,
        options: Readonly<{ allowInsecureHttp?: boolean }> = {},
    ) {
        this.connection = new RepositoryConnection(baseUrl, credential, options);
    }
    async get(collectionId: string, version: string): Promise<RepositorySourceSnapshot | null> {
        return (await this.request("v1/source-snapshots", "QUERY", {
            collectionId,
            version,
        })) as RepositorySourceSnapshot | null;
    }
    put(collectionId: string, version: string, snapshot: RepositorySourceSnapshot) {
        return this.request("v1/source-snapshots/put", "POST", { collectionId, version, ...snapshot });
    }
    async getArtifact(kind: ArtifactSourceKind, id: string, version: string): Promise<RepositorySourceSnapshot | null> {
        return (await this.request("v1/artifact-source-snapshots", "QUERY", {
            kind,
            id,
            version,
        })) as RepositorySourceSnapshot | null;
    }
    putArtifact(kind: ArtifactSourceKind, id: string, version: string, snapshot: RepositorySourceSnapshot) {
        return this.request("v1/artifact-source-snapshots/put", "POST", { kind, id, version, ...snapshot });
    }
    private request(path: string, method: string, input: Record<string, unknown>) {
        return this.connection.json(
            path,
            method,
            {
                ...input,
                namespace: this.credential.namespace,
                namespaceRevision: this.credential.revision,
            },
            true,
            4 * 1024 * 1024,
        );
    }
}
