import { expect } from "bun:test";
import type { sampleContract } from "./resource";

export async function putAsset(
    origin: string,
    token: string,
    uploadId: string,
    namespace: string,
    revision: number,
    sample: Awaited<ReturnType<typeof sampleContract>>,
) {
    return fetch(
        `${origin}/.cms/call/ulvia.repository/v1/uploads/${uploadId}/assets/${encodeURIComponent(sample.asset.id)}`,
        {
            method: "PUT",
            headers: {
                authorization: `Bearer ${token}`,
                origin,
                "content-type": "application/octet-stream",
                "x-repository-namespace": encodeURIComponent(namespace),
                "x-repository-namespace-revision": String(revision),
                "x-repository-content-digest": encodeURIComponent(sample.asset.digest),
            },
            body: sample.bytes,
        },
    );
}

export async function publicDownload(origin: string, sample: Awaited<ReturnType<typeof sampleContract>>) {
    const coordinate = `contract/${sample.namespace}/${sample.id}/${sample.version}`;
    const release = await fetch(`${origin}/.cms/call/ulvia.repository/v1/releases/${coordinate}`);
    expect(release.status).toBe(200);
    expect(release.headers.get("etag")).toBe(`"${sample.digest}"`);
    expect((await release.json()).contractId).toBe(sample.id);
    const asset = await fetch(
        `${origin}/.cms/call/ulvia.repository/v1/assets/${coordinate}/${encodeURIComponent(sample.asset.id)}`,
    );
    expect(asset.status).toBe(200);
    expect(asset.headers.get("etag")).toBe(`"${sample.asset.digest}"`);
    expect(new Uint8Array(await asset.arrayBuffer())).toEqual(sample.bytes);
}
