import {
    signRepositoryRequest,
    type PublicationEnvelope,
    type RemoteCoordinate,
    type RepositoryPublicationRegistry,
} from "@bernouy/cms-repository/repository/publication";

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

export function signedRequest(
    url: URL,
    method: string,
    body: Uint8Array,
    signed: ReturnType<typeof signRepositoryRequest>,
): Request {
    return new Request(url, {
        method,
        body: Buffer.from(body),
        headers: signedHeaders(signed),
    });
}

export function emptySignedRequest(url: URL, method: string, token: string): Request {
    const body = new Uint8Array();
    return signedRequest(url, method, body, signRepositoryRequest(method, url, body, token));
}

export function signedRequestWithoutBody(url: URL, method: string, token: string): Request {
    const signed = signRepositoryRequest(method, url, new Uint8Array(), token);
    return new Request(url, { method, headers: signedHeaders(signed) });
}

function signedHeaders(signed: ReturnType<typeof signRepositoryRequest>): Record<string, string> {
    return {
        Authorization: signed.authorization,
        "X-Ulvia-Timestamp": signed.timestamp,
        "X-Ulvia-Nonce": signed.nonce,
        "X-Ulvia-Content-SHA256": signed.contentDigest,
        "X-Ulvia-Signature": signed.signature,
    };
}
