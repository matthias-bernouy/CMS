import { RepositoryRequestError } from "../../core/errors";
import { RepositoryConnection } from "../../publication/transport/connection";
import type {
    RepositoryConnectionCredential,
    RepositoryNamespaceCredential,
} from "../../publication/transport/credentials";
import type { RepositoryNamespaceView } from "../accounts/interfaces";
import { assertRepositoryNamespace } from "../validation";

export class RepositoryNamespaceClient {
    private readonly connection: RepositoryConnection;
    constructor(
        url: string,
        options: Readonly<{ allowInsecureHttp?: boolean; credential?: RepositoryConnectionCredential }> = {},
    ) {
        this.connection = new RepositoryConnection(url, options.credential, options);
        this.credential = options.credential;
    }
    private readonly credential?: RepositoryConnectionCredential;

    identity(): Promise<string> {
        return this.connection.identity();
    }
    async get(namespace: string): Promise<RepositoryNamespaceView | null> {
        assertRepositoryNamespace(namespace);
        const result = await this.connection.json("v1/namespaces/get", "QUERY", { namespace });
        return result === null ? null : namespaceView(result, namespace);
    }
    async list(): Promise<readonly RepositoryNamespaceView[]> {
        const value = (await this.connection.json("v1/namespaces", "GET", undefined, true)) as { namespaces?: unknown };
        if (!Array.isArray(value.namespaces) || value.namespaces.length > 32) {
            throw new Error("Repository returned an invalid namespace inventory");
        }
        return value.namespaces.map((entry) => namespaceView(entry));
    }
    async claim(namespace: string): Promise<RepositoryNamespaceView> {
        assertRepositoryNamespace(namespace);
        return namespaceView(
            await this.connection.json("v1/namespace-actions/claim", "POST", { namespace }, true),
            namespace,
        );
    }
    async transfer(
        namespace: string,
        namespaceRevision: number,
        targetAccountId: string,
    ): Promise<RepositoryNamespaceView> {
        assertRepositoryNamespace(namespace);
        return namespaceView(
            await this.connection.json(
                "v1/namespace-actions/transfer",
                "POST",
                { namespace, namespaceRevision, targetAccountId },
                true,
            ),
            namespace,
        );
    }
    async suspend(namespace: string, namespaceRevision: number): Promise<RepositoryNamespaceView> {
        assertRepositoryNamespace(namespace);
        return namespaceView(
            await this.connection.json("v1/namespace-actions/suspend", "POST", { namespace, namespaceRevision }, true),
            namespace,
        );
    }
    async ownedCredential(namespace: string): Promise<RepositoryNamespaceCredential> {
        assertRepositoryNamespace(namespace);
        const owned = (await this.list()).find((entry) => entry.namespace === namespace && entry.state === "active");
        if (!owned || !this.credential) {
            throw new RepositoryRequestError("REJECTED", "This account does not own an active Repository namespace");
        }
        return { ...this.credential, namespace, revision: owned.revision };
    }
}

function namespaceView(input: unknown, expected?: string): RepositoryNamespaceView {
    const value = input as RepositoryNamespaceView;
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "namespace,revision,state,updatedAt" ||
        (expected !== undefined && value.namespace !== expected) ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 1 ||
        !["active", "suspended"].includes(value.state) ||
        typeof value.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.updatedAt))
    ) {
        throw new Error("Repository returned invalid namespace metadata");
    }
    assertRepositoryNamespace(value.namespace);
    return { ...value };
}
