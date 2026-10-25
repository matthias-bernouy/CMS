import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    RepositoryNamespaceClient,
    repositoryDigest,
    signNamespaceProof,
} from "@bernouy/cms-repository/repository/namespaces";
import type { RepositoryOwnerCredential } from "@bernouy/cms-repository/repository/namespaces";
import { createOfficialRepositoryApplication } from "../../src/application";

export function keyPair() {
    const key = generateKeyPairSync("ed25519");
    return {
        publicKey: key.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
        privateKey: key.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    };
}

export async function communityFixture(publicUrl?: string) {
    const root = await mkdtemp(join(tmpdir(), "community-repository-"));
    let application: Awaited<ReturnType<typeof createOfficialRepositoryApplication>>;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => application.handle(request) });
    application = await createOfficialRepositoryApplication(root, "o".repeat(32), publicUrl ?? server.url.origin);
    const base = server.url.href;
    const key = keyPair();
    const client = new RepositoryNamespaceClient(base);
    const credential: RepositoryOwnerCredential = {
        repositoryId: await client.identity(),
        namespace: "community",
        revision: 0,
        resolvePrivateKey: async () => key.privateKey,
    };
    await client.claim(credential, key.publicKey);
    return { root, application, server, base, key, client, credential: { ...credential, revision: 1 } };
}

export function capabilityProof(
    credential: RepositoryOwnerCredential,
    privateKey: string,
    action: string,
    subject: string,
    value: unknown,
) {
    return JSON.stringify(
        signNamespaceProof(
            {
                repositoryId: credential.repositoryId,
                namespace: credential.namespace,
                revision: credential.revision,
                action,
                subject,
                digest: repositoryDigest(value),
                timestamp: Date.now(),
                nonce: randomUUID(),
            },
            privateKey,
        ),
    );
}

export function simpleContract(publisherId = "community", version = "1.0.0", name = "Community contract") {
    return JSON.stringify({
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "community.example",
        version,
        publisherId,
        name,
        capabilities: [
            {
                id: "ping",
                access: "public",
                behavior: { effect: "query", execution: "sync" },
                input: { type: "object", properties: {}, required: [] },
                output: { type: "null" },
                errors: [],
                binding: {
                    transport: "http",
                    method: "GET",
                    path: "/ping",
                    response: { successStatuses: [204], contentTypes: [], errorStatuses: {} },
                },
            },
        ],
    });
}
