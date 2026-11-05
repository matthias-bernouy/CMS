import { expect } from "bun:test";
import type { repositoryApi } from "../client";
import { sampleContract } from "./resource";
import { publicDownload, putAsset } from "./assets";

export async function exercisePublication(
    api: ReturnType<typeof repositoryApi>,
    origin: string,
    a: { token: string },
    b: { cookie: string; accountId: string },
) {
    const token = await api.pat(b.cookie);
    const request = api.request;
    const registry = "ulvia/repository";
    const begin = async (
        sample: Awaited<ReturnType<typeof sampleContract>>,
        revision: number,
        credentials: { token: string },
    ) => {
        const response = await fetch(`${origin}/.cms/call/ulvia/repository/v1/uploads`, {
            method: "POST",
            body: sample.manifest,
            headers: {
                authorization: `Bearer ${credentials.token}`,
                "content-type": "application/octet-stream",
                "x-repository-namespace": encodeURIComponent(sample.namespace),
                "x-repository-namespace-revision": String(revision),
            },
        });
        expect(response.status).toBe(200);
        return (await response.json()).uploadId as string;
    };
    const commit = (uploadId: string, namespace: string, revision: number, credentials: { token: string }) =>
        request(
            registry,
            "/v1/uploads/commit",
            "POST",
            { uploadId, namespace, namespaceRevision: revision },
            credentials,
        );
    const first = await sampleContract("journey.a");
    const initial = await begin(first, 1, a);
    expect((await putAsset(origin, a.token, initial, first.namespace, 1, first)).status).toBe(204);
    const published = await commit(initial, first.namespace, 1, a);
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ added: true, digest: first.digest });
    await publicDownload(origin, first);

    expect(
        (await request(registry, "/v1/namespace-actions/claim", "POST", { namespace: "journey.b" }, token)).status,
    ).toBe(200);
    const next = await sampleContract("journey.a", "1.0.1");
    const oldUpload = await begin(next, 1, a);
    for (const [method, path] of [
        ["QUERY", "status"],
        ["POST", "commit"],
        ["POST", "abort"],
    ]) {
        const refused = await request(
            registry,
            `/v1/uploads/${path}`,
            method,
            {
                uploadId: oldUpload,
                namespace: "journey.b",
                namespaceRevision: 1,
            },
            token,
        );
        expect(refused.status).toBe(409);
        expect((await refused.json()).error.code).toBe("REJECTED");
    }
    expect((await putAsset(origin, token.token, oldUpload, "journey.b", 1, next)).status).toBe(409);
    const unchanged = await request(
        registry,
        "/v1/uploads/status",
        "QUERY",
        {
            uploadId: oldUpload,
            namespace: "journey.a",
            namespaceRevision: 1,
        },
        a,
    );
    expect((await unchanged.json()).uploadedAssetIds).toEqual([]);
    const transferred = await request(
        registry,
        "/v1/namespace-actions/transfer",
        "POST",
        {
            namespace: "journey.a",
            namespaceRevision: 1,
            targetAccountId: b.accountId,
        },
        a,
    );
    expect(transferred.status).toBe(200);
    expect((await transferred.json()).revision).toBe(2);
    expect((await commit(oldUpload, "journey.a", 1, a)).status).toBe(409);
    expect((await commit(oldUpload, "journey.a", 2, token)).status).toBe(409);
    const newUpload = await begin(next, 2, token);
    expect(newUpload).not.toBe(oldUpload);
    expect((await putAsset(origin, token.token, newUpload, "journey.a", 2, next)).status).toBe(204);
    expect((await commit(newUpload, "journey.a", 2, token)).status).toBe(200);
    await publicDownload(origin, next);

    const own = await sampleContract("journey.b");
    const ownUpload = await begin(own, 1, token);
    expect((await putAsset(origin, token.token, ownUpload, "journey.b", 1, own)).status).toBe(204);
    expect((await commit(ownUpload, "journey.b", 1, token)).status).toBe(200);
    const retry = await commit(ownUpload, "journey.b", 1, token);
    expect(retry.status).toBe(200);
    expect((await retry.json()).digest).toBe(own.digest);
    const interrupted = await begin(await sampleContract("journey.b", "1.0.1"), 1, token);
    const revoked = await request("ulvia/cms.access", `/personal-access-tokens/${token.id}`, "DELETE", undefined, b);
    expect(revoked.status).toBe(200);
    expect((await commit(interrupted, "journey.b", 1, token)).status).toBe(401);
    const replacement = await api.pat(b.cookie);
    const resumed = await request(
        registry,
        "/v1/uploads/status",
        "QUERY",
        {
            uploadId: interrupted,
            namespace: "journey.b",
            namespaceRevision: 1,
        },
        replacement,
    );
    expect(resumed.status).toBe(200);
    const absent = await request(registry, `/v1/releases/contract/journey.b/${own.id}/1.0.1`);
    expect(absent.status).toBe(404);
    const search = await request(registry, "/v1/search", "QUERY", { query: "Greeting", kinds: ["contract"] });
    expect(search.status).toBe(200);
    expect((await search.json()).results.length).toBeGreaterThan(0);
    return { token: replacement, sample: own };
}
