import { NamespaceAccessError } from "@bernouy/cms-repository/repository/authoring";
import { randomUUID } from "node:crypto";
import type { SecretStore } from "@bernouy/secret-store";
import { RepositoryConnection, RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import type { RepositoryConnectionCredential } from "@bernouy/cms-repository/repository/namespaces";

const SECRET = "REPOSITORY_CONNECTION";
interface StoredConnection {
    readonly schema: "ulvia.repository-pat.v1";
    readonly origin: string;
    readonly repositoryId: string;
    readonly token: string;
    readonly generation: string;
}

/** One encrypted record atomically binds the PAT to its origin and Repository identity. */
export class PublisherConnection {
    readonly origin: string;
    constructor(
        private readonly secrets: SecretStore,
        url: string,
        readonly allowInsecureHttp: boolean,
    ) {
        this.origin = new RepositoryConnection(url, undefined, { allowInsecureHttp }).base.origin;
    }
    async view() {
        const stored = await this.read();
        return { configured: stored !== null, repositoryUrl: this.origin, repositoryId: stored?.repositoryId ?? null };
    }
    async configure(token: string) {
        if (!/^pat_[A-Za-z0-9_-]{43}$/u.test(token)) {
            throw new NamespaceAccessError("Invalid Repository personal access token");
        }
        const previous = await this.read();
        const repositoryId = await new RepositoryConnection(this.origin, undefined, this).identity();
        if (previous && previous.repositoryId !== repositoryId) {
            throw new NamespaceAccessError(
                "Repository identity changed; disconnect before configuring another Repository",
            );
        }
        const credential: RepositoryConnectionCredential = {
            origin: this.origin,
            repositoryId,
            resolveToken: async () => token,
        };
        // Verify membership before replacing a working connection.
        await new RepositoryNamespaceClient(this.origin, {
            allowInsecureHttp: this.allowInsecureHttp,
            credential,
        }).list();
        await this.secrets.set(
            SECRET,
            JSON.stringify({
                schema: "ulvia.repository-pat.v1",
                origin: this.origin,
                repositoryId,
                token,
                generation: randomUUID(),
            } satisfies StoredConnection),
        );
        return { configured: true, repositoryUrl: this.origin, repositoryId };
    }
    async disconnect() {
        await this.secrets.delete(SECRET);
        return { configured: false, repositoryUrl: this.origin, repositoryId: null };
    }
    async credential(): Promise<RepositoryConnectionCredential> {
        const expected = await this.read();
        if (!expected) {
            throw new NamespaceAccessError("Repository connection is not configured");
        }
        const { origin, repositoryId, generation } = expected;
        return {
            origin,
            repositoryId,
            resolveToken: async () => {
                const current = await this.read();
                if (!current || current.generation !== generation || current.repositoryId !== repositoryId) {
                    throw new NamespaceAccessError("Repository connection changed");
                }
                return current.token;
            },
        };
    }
    private async read(): Promise<StoredConnection | null> {
        const raw = await this.secrets.get(SECRET);
        if (raw === null) {
            return null;
        }
        if (raw.length > 1024) {
            throw new Error("Invalid stored Repository connection");
        }
        let value: StoredConnection;
        try {
            value = JSON.parse(raw) as StoredConnection;
        } catch {
            throw new Error("Invalid stored Repository connection");
        }
        if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            Object.keys(value).sort().join(",") !== "generation,origin,repositoryId,schema,token" ||
            value.schema !== "ulvia.repository-pat.v1" ||
            value.origin !== this.origin ||
            typeof value.repositoryId !== "string" ||
            !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.repositoryId) ||
            typeof value.token !== "string" ||
            !/^pat_[A-Za-z0-9_-]{43}$/u.test(value.token) ||
            typeof value.generation !== "string" ||
            !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value.generation)
        ) {
            throw new Error("Invalid stored Repository connection");
        }
        return value;
    }
}
