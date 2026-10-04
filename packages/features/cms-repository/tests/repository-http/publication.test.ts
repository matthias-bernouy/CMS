import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemRepositoryPublicationUploadStore } from "@bernouy/cms-repository/repository/filesystem";
import {
    encodePublicationUpload,
    InMemoryRepositoryReplayStore,
    parsePublicationUpload,
    RepositoryMutationEndpoint,
    signRepositoryContentDigest,
    signRepositoryRequest,
    type PublicationEnvelope,
    type RemoteCoordinate,
    type RepositoryPublicationRegistry,
} from "@bernouy/cms-repository/repository/publication";
import { createHash } from "node:crypto";

const directories: string[] = [];

test("publication metadata carries expanded collection documents and asset indexes", () => {
    const canonicalJson = JSON.stringify({ value: "x".repeat(3 * 1024 * 1024) });
    const assets = Array.from({ length: 257 }, (_, index) => ({
        id: `asset-${index}`,
        byteLength: 0,
        digest: `sha256:${"0".repeat(64)}` as const,
    }));
    expect(parsePublicationUpload(encodePublicationUpload({ kind: "collection", canonicalJson, assets }))).toEqual({
        kind: "collection",
        canonicalJson,
        assets,
    });
});

afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("a shared replay store rejects one signature across endpoint instances", async () => {
    const root = await temporaryDirectory();
    const registry = new RecordingRegistry();
    const replays = new InMemoryRepositoryReplayStore();
    const uploads = new FilesystemRepositoryPublicationUploadStore(root);
    const token = "a".repeat(32);
    const url = new URL("https://repository.example/v1/publication-uploads");
    const body = encodePublicationUpload({ kind: "provider-manifest", canonicalJson: "{}", assets: [] });
    const signed = signRepositoryRequest("POST", url, body, token);
    const request = () => signedRequest(url, "POST", body, signed);
    const options = { token, uploads, replays };

    const first = new RepositoryMutationEndpoint(registry, options);
    const second = new RepositoryMutationEndpoint(registry, options);
    const created = await first.handle(request());
    expect(created?.status).toBe(200);
    expect((await second.handle(request()))?.status).toBe(401);
    expect(registry.publications).toHaveLength(0);

    const uploadId = ((await created!.json()) as { uploadId: string }).uploadId;
    const commitUrl = new URL(`/v1/publication-uploads/${uploadId}`, url);
    const commitBody = new Uint8Array();
    const commit = signRepositoryRequest("POST", commitUrl, commitBody, token);
    expect((await first.handle(signedRequest(commitUrl, "POST", commitBody, commit)))?.status).toBe(200);
    expect(registry.publications).toHaveLength(1);
});

test("assets remain invisible until every streamed byte is verified and committed", async () => {
    const root = await temporaryDirectory();
    const registry = new RecordingRegistry();
    const token = "b".repeat(32);
    const endpoint = new RepositoryMutationEndpoint(registry, {
        token,
        uploads: new FilesystemRepositoryPublicationUploadStore(root),
    });
    const expected = Buffer.from("verified asset");
    const digest = createHash("sha256").update(expected).digest("hex");
    const createUrl = new URL("https://repository.example/v1/publication-uploads");
    const manifest = encodePublicationUpload({
        kind: "contract",
        canonicalJson: "{}",
        assets: [{ id: "fixture.txt", byteLength: expected.byteLength, digest: `sha256:${digest}` }],
    });
    const created = await endpoint.handle(
        signedRequest(createUrl, "POST", manifest, signRepositoryRequest("POST", createUrl, manifest, token)),
    );
    const uploadId = ((await created!.json()) as { uploadId: string }).uploadId;
    const commitUrl = new URL(`/v1/publication-uploads/${uploadId}`, createUrl);

    expect((await endpoint.handle(emptySignedRequest(commitUrl, "POST", token)))?.status).toBe(409);
    expect(registry.publications).toHaveLength(0);

    const assetUrl = new URL(`/v1/publication-uploads/${uploadId}/assets/fixture.txt`, createUrl);
    const tampered = Buffer.from("tampered asset");
    const tamperedSignature = signRepositoryContentDigest("PUT", assetUrl, digest, token);
    expect((await endpoint.handle(signedRequest(assetUrl, "PUT", tampered, tamperedSignature)))?.status).toBe(409);
    expect(
        (
            await endpoint.handle(
                signedRequest(assetUrl, "PUT", expected, signRepositoryRequest("PUT", assetUrl, expected, token)),
            )
        )?.status,
    ).toBe(204);

    expect((await endpoint.handle(emptySignedRequest(commitUrl, "POST", token)))?.status).toBe(200);
    expect(registry.publications).toHaveLength(1);
    const published = registry.publications[0]!.assets[0]!.bytes;
    expect(published instanceof Blob ? await published.text() : new TextDecoder().decode(published)).toBe(
        "verified asset",
    );
    expect((await endpoint.handle(emptySignedRequest(commitUrl, "POST", token)))?.status).toBe(200);
    expect(registry.publications).toHaveLength(1);
});

class RecordingRegistry implements RepositoryPublicationRegistry {
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

function signedRequest(
    url: URL,
    method: string,
    body: Uint8Array,
    signed: ReturnType<typeof signRepositoryRequest>,
): Request {
    return new Request(url, {
        method,
        body: Buffer.from(body),
        headers: {
            Authorization: signed.authorization,
            "X-Ulvia-Timestamp": signed.timestamp,
            "X-Ulvia-Nonce": signed.nonce,
            "X-Ulvia-Content-SHA256": signed.contentDigest,
            "X-Ulvia-Signature": signed.signature,
        },
    });
}

function emptySignedRequest(url: URL, method: string, token: string): Request {
    const body = new Uint8Array();
    return signedRequest(url, method, body, signRepositoryRequest(method, url, body, token));
}

async function temporaryDirectory(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "repository-publication-"));
    directories.push(path);
    return path;
}
