import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { FilesystemRepositoryNamespaceStore } from "@bernouy/cms-repository/repository/filesystem";
import {
    RepositoryNamespaceAuthority,
    type RepositoryOwnerCredential,
    repositoryDigest,
    repositoryWriteHeaders,
    signNamespaceProof,
} from "@bernouy/cms-repository/repository/namespaces";
import {
    type PublicationEnvelope,
    type RemoteCoordinate,
    type RepositoryPublicationRegistry,
} from "@bernouy/cms-repository/repository/publication";

export class RecordingRegistry implements RepositoryPublicationRegistry {
    readonly publications: PublicationEnvelope[] = [];
    readonly evidencePublications: string[] = [];

    async publish(envelope: PublicationEnvelope) {
        this.publications.push({
            ...envelope,
            assets: await Promise.all(
                envelope.assets.map(async (asset) => ({
                    id: asset.id,
                    bytes:
                        asset.bytes instanceof Blob
                            ? new Uint8Array(await asset.bytes.arrayBuffer())
                            : asset.bytes.slice(),
                })),
            ),
        });
        return { kind: envelope.kind, added: true, digest: `sha256:${"0".repeat(64)}`, release: {} };
    }

    async setYank(coordinate: RemoteCoordinate, reason: string | null) {
        return {
            ...coordinate,
            yank: reason ? { reason, yankedAt: new Date(0).toISOString() } : null,
        };
    }

    async publishEvidence(canonicalJson: string) {
        this.evidencePublications.push(canonicalJson);
        return {
            providerId: "ulvia.example",
            contractId: "ulvia.example.items",
            evidenceId: "00000000-0000-4000-8000-000000000001",
            added: true,
            digest: `sha256:${"0".repeat(64)}` as const,
        };
    }
}

export async function ownerFixture(root: string, namespace = "publisher") {
    const pair = generateKeyPairSync("ed25519");
    const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicKey = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
    const namespaces = new RepositoryNamespaceAuthority(
        "test-repository",
        new FilesystemRepositoryNamespaceStore(root),
    );
    await namespaces.claim(
        namespace,
        publicKey,
        signNamespaceProof(
            {
                repositoryId: namespaces.repositoryId,
                namespace,
                revision: 0,
                action: "claim",
                subject: namespace,
                digest: repositoryDigest({ publicKey }),
                timestamp: Date.now(),
                nonce: randomUUID(),
            },
            privateKey,
        ),
    );
    const credential: RepositoryOwnerCredential = {
        repositoryId: namespaces.repositoryId,
        namespace,
        revision: 1,
        resolvePrivateKey: async () => privateKey,
    };
    return { namespaces, credential };
}

export function signOwnerRequest(method: string, url: URL, body: Uint8Array, credential: RepositoryOwnerCredential) {
    return signOwnerContentDigest(method, url, createHash("sha256").update(body).digest("hex"), credential);
}

export function signOwnerContentDigest(
    method: string,
    url: URL,
    digest: string,
    credential: RepositoryOwnerCredential,
) {
    return repositoryWriteHeaders(method, url, digest, credential);
}

export function signedRequest(url: URL, method: string, body: Uint8Array, headers: Record<string, string>): Request {
    return new Request(url, { method, body: Buffer.from(body), headers });
}

export async function emptySignedRequest(
    url: URL,
    method: string,
    credential: RepositoryOwnerCredential,
): Promise<Request> {
    const body = new Uint8Array();
    return signedRequest(url, method, body, await signOwnerRequest(method, url, body, credential));
}

export async function signedRequestWithoutBody(
    url: URL,
    method: string,
    credential: RepositoryOwnerCredential,
): Promise<Request> {
    return new Request(url, { method, headers: await signOwnerRequest(method, url, new Uint8Array(), credential) });
}
