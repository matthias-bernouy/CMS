import type {
    PublicationEnvelope,
    RemoteCoordinate,
    RepositoryPublicationRegistry,
} from "@bernouy/cms-repository/repository/publication";
import { repositoryApplication } from "../../../../../tests/fixtures/repository/application";

export class RecordingRegistry implements RepositoryPublicationRegistry {
    readonly publications: PublicationEnvelope[] = [];

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
}

export async function ownerFixture(root: string, namespace = "publisher", registry?: RepositoryPublicationRegistry) {
    const application = repositoryApplication(root, "test-repository", registry);
    const owner = await application.account();
    await application.namespaces.claim(owner.accountId, namespace);
    const credential = {
        origin: "https://repository.example",
        repositoryId: application.repositoryId,
        namespace,
        revision: 1,
        resolveToken: async () => owner.token,
    };
    return { application, owner, credential, namespaces: application.namespaces };
}

export function jsonRequest(path: string, token: string, input: Record<string, unknown>, method = "POST") {
    if (path === "/v1/uploads") {
        return new Request(`https://repository.example/.cms/call/ulvia.repository${path}`, {
            method,
            body: input.manifest as string,
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/octet-stream",
                "x-repository-namespace": encodeURIComponent(input.namespace as string),
                "x-repository-namespace-revision": String(input.namespaceRevision),
            },
        });
    }
    return new Request(`https://repository.example/.cms/call/ulvia.repository${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(input),
    });
}

export function assetRequest(path: string, token: string, namespace: string, bytes: Uint8Array, digest: string) {
    return new Request(`https://repository.example/.cms/call/ulvia.repository${path}`, {
        method: "PUT",
        body: Buffer.from(bytes),
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/octet-stream",
            "x-repository-namespace": encodeURIComponent(namespace),
            "x-repository-namespace-revision": "1",
            "x-repository-content-digest": encodeURIComponent(digest),
        },
    });
}
